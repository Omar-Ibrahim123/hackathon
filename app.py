from dotenv import load_dotenv

load_dotenv()  # must run before CarbonEngine() reads CLIMATIQ_API_KEY / ANTHROPIC_API_KEY

import streamlit as st  # type: ignore[import-not-found]
from engine import CarbonEngine, OcrFailedError, OcrUnavailableError

# Set page layout
st.set_page_config(page_title="EcoReceipt Scanner", layout="wide")
st.title("🌱 EcoReceipt: Carbon Footprint Scanner")

# Initialize Master Engine
@st.cache_resource
def get_engine():
    return CarbonEngine()

engine = get_engine()

# Sample items used only when ANTHROPIC_API_KEY isn't configured, so the UI is
# still demoable without live OCR.
MOCK_OCR_OUTPUT = [
    {"raw_item": "OATLY BARISTA OAT MILK", "qty": 1},
    {"raw_item": "BNDL GROUND BEEF 1LB", "qty": 2},
    {"raw_item": "UNKNOWN DRAGONFRUIT SNACK", "qty": 1},
]

st.session_state.setdefault("manual_cart", [])
st.session_state.setdefault("manual_results", None)


def render_results(results: dict) -> None:
    col1, col2, col3 = st.columns(3)
    col1.metric("Total Footprint", f"{results['summary']['total_co2e_kg']} kg CO₂e")
    col2.metric("Items Processed", results["summary"]["total_items_processed"])

    st.subheader("Breakdown")
    line_items = results["line_items"]

    st.dataframe(
        [
            {
                key: item.get(key)
                for key in ("raw_item", "matched_item", "category", "item_co2e_kg", "source")
            }
            for item in line_items
        ],
        use_container_width=True,
    )

    st.subheader("Footprint by Category")
    category_totals = {}
    for item in line_items:
        category = item.get("category", "Unknown")
        category_totals[category] = category_totals.get(category, 0) + item.get("item_co2e_kg", 0)
    st.bar_chart(category_totals)


# Sidebar for file upload
st.sidebar.header("Upload Receipt")
uploaded_file = st.sidebar.file_uploader("Choose an image...", type=["jpg", "jpeg", "png"])

scan_tab, search_tab = st.tabs(["📷 Scan Receipt", "🔍 Manual Search"])

with scan_tab:
    if uploaded_file is not None:
        st.sidebar.success("Receipt uploaded successfully!")

        with st.spinner("Analyzing environmental impact..."):
            try:
                results = engine.analyze_receipt_image(
                    uploaded_file.getvalue(), content_type=uploaded_file.type
                )
            except OcrUnavailableError:
                st.sidebar.warning(
                    "ANTHROPIC_API_KEY not set — showing a sample receipt instead of scanning the upload."
                )
                results = engine.analyze_receipt(MOCK_OCR_OUTPUT)
            except OcrFailedError as e:
                st.error(f"Couldn't read that receipt: {e}")
                st.stop()

            render_results(results)
    else:
        st.info("Upload a receipt image in the sidebar to get started.")

with search_tab:
    st.subheader("Search for an item")
    query = st.text_input(
        "Search items (e.g. 'ground beef', 'oat milk')",
        key="manual_search_query",
        label_visibility="collapsed",
        placeholder="Search items (e.g. 'ground beef', 'oat milk')",
    )

    if query:
        dataset_df = engine.dataset_df
        matches = dataset_df[
            dataset_df["item_name"].str.contains(query, case=False, na=False)
            | dataset_df["keywords"].str.contains(query, case=False, na=False)
        ]

        if matches.empty:
            st.caption("No matching items found.")
        else:
            for _, row in matches.head(10).iterrows():
                c1, c2, c3, c4 = st.columns([3, 2, 1, 1])
                c1.write(f"**{row['item_name']}**")
                c2.caption(row["category"])
                qty = c3.number_input(
                    "Qty", min_value=0.1, value=1.0, step=1.0,
                    key=f"qty_{row['id']}", label_visibility="collapsed",
                )
                if c4.button("Add", key=f"add_{row['id']}"):
                    st.session_state.manual_cart.append(
                        {"raw_item": row["item_name"], "qty": qty, "id": row["id"]}
                    )
                    st.session_state.manual_results = None
                    st.rerun()

    st.divider()
    st.subheader("Your list")

    if not st.session_state.manual_cart:
        st.caption("No items added yet. Search above and click Add.")
    else:
        for i, cart_item in enumerate(st.session_state.manual_cart):
            c1, c2, c3 = st.columns([4, 2, 1])
            c1.write(cart_item["raw_item"])
            c2.write(f"Qty: {cart_item['qty']:g}")
            if c3.button("✕", key=f"remove_{i}"):
                st.session_state.manual_cart.pop(i)
                st.session_state.manual_results = None
                st.rerun()

        col_a, col_b = st.columns(2)
        if col_a.button("Calculate Footprint", type="primary"):
            with st.spinner("Calculating environmental impact..."):
                st.session_state.manual_results = engine.analyze_receipt(st.session_state.manual_cart)
        if col_b.button("Clear list"):
            st.session_state.manual_cart = []
            st.session_state.manual_results = None
            st.rerun()

    if st.session_state.manual_results:
        st.divider()
        render_results(st.session_state.manual_results)
