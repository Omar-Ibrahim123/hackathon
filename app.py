from dotenv import load_dotenv

load_dotenv()  # must run before CarbonEngine() reads CLIMATIQ_API_KEY / GEMINI_API_KEY

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

# Sample items used only when GEMINI_API_KEY isn't configured, so the UI is
# still demoable without live OCR.
MOCK_OCR_OUTPUT = [
    {"raw_item": "OATLY BARISTA OAT MILK", "qty": 1},
    {"raw_item": "BNDL GROUND BEEF 1LB", "qty": 2},
    {"raw_item": "UNKNOWN DRAGONFRUIT SNACK", "qty": 1},
]

# Sidebar for file upload
st.sidebar.header("Upload Receipt")
uploaded_file = st.sidebar.file_uploader("Choose an image...", type=["jpg", "jpeg", "png"])

if uploaded_file is not None:
    st.sidebar.success("Receipt uploaded successfully!")

    with st.spinner("Analyzing environmental impact..."):
        try:
            results = engine.analyze_receipt_image(
                uploaded_file.getvalue(), content_type=uploaded_file.type
            )
        except OcrUnavailableError:
            st.sidebar.warning(
                "GEMINI_API_KEY not set — showing a sample receipt instead of scanning the upload."
            )
            results = engine.analyze_receipt(MOCK_OCR_OUTPUT)
        except OcrFailedError as e:
            st.error(f"Couldn't read that receipt: {e}")
            st.stop()

        # Display Metrics
        col1, col2, col3 = st.columns(3)
        col1.metric("Total Footprint", f"{results['summary']['total_co2e_kg']} kg CO₂e")
        col2.metric("Items Processed", results['summary']['total_items_processed'])
        
        # Display Data Table
        st.subheader("Receipt Breakdown")
        line_items = results["line_items"]
        
        # Basic styling for the dataframe
        st.dataframe(
            [
                {
                    key: item.get(key)
                    for key in ("raw_item", "matched_item", "category", "item_co2e_kg", "source", "status", "error")
                }
                for item in line_items
            ],
            use_container_width=True
        )
        
        # Add a visual chart (Plotly/Streamlit native)
        st.subheader("Footprint by Category")
        category_totals = {}
        for item in line_items:
            category = item.get("category", "Unknown")
            category_totals[category] = category_totals.get(category, 0) + item.get("item_co2e_kg", 0)
        st.bar_chart(category_totals)
else:
    st.info("Upload a receipt image in the sidebar to get started.")