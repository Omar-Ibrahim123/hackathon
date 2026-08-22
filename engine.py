import os

import pandas as pd  # type: ignore[import-unresolved]

from api_client import ClimatiqAPIClient
from calculator import process_receipt_items
from fallback import estimate_unmatched_item
from matcher import ReceiptMatcher
from ocr import OcrFailedError, OcrUnavailableError, extract_items_from_receipt

EMISSION_FACTORS_CSV = os.path.join(os.path.dirname(__file__), "emission_factors.csv")

__all__ = ["CarbonEngine", "OcrUnavailableError", "OcrFailedError"]


class CarbonEngine:
    """Ties the whole EcoReceipt pipeline together: OCR -> local dataset
    match -> Climatiq API match -> Gemini estimate, in that order, so each
    item only falls through to a slower/costlier stage if the previous one
    couldn't identify it."""

    def __init__(self):
        self.matcher = ReceiptMatcher(EMISSION_FACTORS_CSV)
        self.dataset_df = pd.read_csv(EMISSION_FACTORS_CSV)

        climatiq_key = os.getenv("CLIMATIQ_API_KEY", "")
        self.climatiq = ClimatiqAPIClient(api_key=climatiq_key) if climatiq_key else None

    def analyze_receipt_image(self, image_bytes: bytes, content_type: str = "image/jpeg") -> dict:
        parsed_items = extract_items_from_receipt(image_bytes, content_type)
        return self.analyze_receipt(parsed_items)

    def analyze_receipt(self, parsed_items: list) -> dict:
        result = process_receipt_items(parsed_items, self.dataset_df, self.matcher)

        for line_item in result["line_items"]:
            if line_item["status"] != "UNMATCHED":
                line_item.setdefault("source", "LOCAL_DATASET")
                continue

            self._resolve_unmatched(line_item)

        result["summary"]["total_co2e_kg"] = round(
            sum(item["item_co2e_kg"] for item in result["line_items"]), 2
        )

        return result

    def _resolve_unmatched(self, line_item: dict) -> None:
        raw_item = line_item["raw_item"]
        qty = line_item["qty"]

        if self.climatiq is not None:
            climatiq_result = self.climatiq.fetch_item_footprint(raw_item, qty)
            if climatiq_result["status"] == "SUCCESS":
                line_item.update(
                    matched_item=climatiq_result["matched_item"],
                    category=climatiq_result["category"],
                    item_co2e_kg=round(climatiq_result["co2e_per_kg"], 2),
                    confidence_score=0.6,
                    status="MATCHED",
                    source="CLIMATIQ_API",
                )
                return

        fallback_result = estimate_unmatched_item(raw_item)
        item_co2e = round(
            fallback_result["co2e_per_kg"] * fallback_result["default_unit_weight_kg"] * qty,
            2,
        )
        line_item.update(
            matched_item=fallback_result["matched_item"],
            category=fallback_result["category"],
            item_co2e_kg=item_co2e,
            confidence_score=fallback_result["confidence_score"],
            status="ESTIMATED" if fallback_result["status"] == "FALLBACK_GEMINI_ESTIMATED" else "UNMATCHED",
            source=fallback_result["status"],
        )
