import os

from dotenv import load_dotenv
import streamlit as st  # type: ignore[import-not-found]

from engine import CarbonEngine
from manual_items import ManualItemsError, parse_manual_items
from ocr import OcrFailedError, OcrUnavailableError


load_dotenv()
st.set_page_config(page_title="EcoReceipt Scanner", layout="wide")
st.title("EcoReceipt: Carbon Footprint Scanner")


@st.cache_resource
def get_engine():
    return CarbonEngine()


engine = get_engine()
if not os.getenv("CLIMATIQ_API_KEY"):
    st.warning("Set CLIMATIQ_API_KEY before uploading a receipt.")

MOCK_OCR_OUTPUT = [
    {"raw_item": "OATLY BARISTA OAT MILK", "qty": 1},
    {"raw_item": "BNDL GROUND BEEF 1LB", "qty": 2},
    {"raw_item": "UNKNOWN DRAGONFRUIT SNACK", "qty": 1},
]

st.sidebar.header("Upload Receipt")
uploaded_file = st.sidebar.file_uploader(
    "Choose an image...", type=["jpg", "jpeg", "png"]
)
manual_file = st.sidebar.file_uploader(
    "Or upload items...", type=["csv", "json"], key="manual_items"
)

if manual_file is not None:
    try:
        manual_items = parse_manual_items(manual_file.getvalue(), manual_file.name)
    except ManualItemsError as error:
        st.error(f"Invalid item upload: {error}")
        st.stop()
    with st.spinner("Analyzing uploaded items..."):
        results = engine.analyze_receipt(manual_items)
elif uploaded_file is not None:
    st.sidebar.success("Receipt uploaded successfully!")
    with st.spinner("Analyzing environmental impact..."):
        try:
            results = engine.analyze_receipt_image(
                uploaded_file.getvalue(), content_type=uploaded_file.type
            )
        except OcrUnavailableError:
            st.sidebar.warning(
                "GEMINI_API_KEY is not set. Showing sample items instead."
            )
            results = engine.analyze_receipt(MOCK_OCR_OUTPUT)
        except OcrFailedError as error:
            st.error(f"Could not read that receipt: {error}")
            st.stop()

if manual_file is not None or uploaded_file is not None:
    summary = results["summary"]
    col1, col2, col3 = st.columns(3)
    col1.metric("Total Footprint", f"{summary['total_co2e_kg']} kg CO2e")
    col2.metric("Items Processed", summary["total_items_processed"])
    col3.metric("Car Miles Equivalent", summary["equivalencies"]["car_miles_driven"])

    st.subheader("Receipt Breakdown")
    st.dataframe(results["line_items"], use_container_width=True)

    st.subheader("Footprint by Category")
    st.bar_chart(summary["category_totals_kg"])
else:
    st.info("Upload a receipt image in the sidebar to get started.")
