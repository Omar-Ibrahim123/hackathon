import streamlit as st  # type: ignore[import-not-found]
from engine import CarbonEngine

# Set page layout
st.set_page_config(page_title="EcoReceipt Scanner", layout="wide")
st.title("🌱 EcoReceipt: Carbon Footprint Scanner")

# Initialize Master Engine
@st.cache_resource
def get_engine():
    return CarbonEngine()

engine = get_engine()

# Sidebar for file upload
st.sidebar.header("Upload Receipt")
uploaded_file = st.sidebar.file_uploader("Choose an image...", type=["jpg", "jpeg", "png"])

if uploaded_file is not None:
    st.sidebar.success("Receipt uploaded successfully!")
    
    # ---------------------------------------------------------
    # PLACEHOLDER: This is where your Codex friend's OCR code goes.
    # For now, we simulate their output so you can build the UI.
    # ---------------------------------------------------------
    mock_ocr_output = [
        {"raw_item": "OATLY BARISTA OAT MILK", "qty": 1},
        {"raw_item": "BNDL GROUND BEEF 1LB", "qty": 2},
        {"raw_item": "UNKNOWN DRAGONFRUIT SNACK", "qty": 1}
    ]
    
    with st.spinner("Analyzing environmental impact..."):
        # Run the engine
        results = engine.analyze_receipt(mock_ocr_output)
        
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
                    for key in ("raw_item", "matched_item", "category", "item_co2e_kg", "source")
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