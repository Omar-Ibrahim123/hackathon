import os

import pandas as pd  # type: ignore[import-unresolved]

from api_client import ClimatiqAPIClient
from calculator import process_receipt_items
from fallback import estimate_unmatched_item
from matcher import ReceiptMatcher
from ocr import OcrFailedError, OcrUnavailableError, extract_items_from_receipt

EMISSION_FACTORS_CSV = os.path.join(os.path.dirname(__file__), "emission_factors.csv")

__all__ = ["CarbonEngine", "OcrUnavailableError", "OcrFailedError"]

_WEIGHT_UNIT_TO_KG = {
    "kg": 1.0, "kilogram": 1.0, "kilograms": 1.0,
    "g": 0.001, "gram": 0.001, "grams": 0.001,
    "lb": 0.453592, "lbs": 0.453592, "pound": 0.453592, "pounds": 0.453592,
    "oz": 0.0283495, "ounce": 0.0283495, "ounces": 0.0283495,
}


def _weight_to_kg(value, unit) -> float:
    """Converts a receipt-printed weight to kg. Falls back to treating the
    value as already-kg if the unit is missing/unrecognized, rather than
    dropping real receipt data just because the unit label is unusual."""
    factor = _WEIGHT_UNIT_TO_KG.get(str(unit).strip().lower()) if unit else None
    return value * factor if factor is not None else value


class CarbonEngine:
    """Ties the whole EcoReceipt pipeline together: OCR -> Climatiq API match
    -> local dataset match -> Claude estimate, in that order. Climatiq is
    queried for every item so footprints come from its dataset; the local
    CSV match only fills in when Climatiq can't identify the item (and
    still supplies eco-swap recommendations), and Claude is the last
    resort for anything neither source recognizes."""

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
            self._resolve_line_item(line_item)

        result["summary"]["total_co2e_kg"] = round(
            sum(item["item_co2e_kg"] for item in result["line_items"]), 2
        )

        return result

    def _resolve_line_item(self, line_item: dict) -> None:
        """Climatiq is queried for every item, so footprints reflect its
        dataset rather than the local CSV. The local dataset match (already
        computed by process_receipt_items) is only kept when Climatiq can't
        identify the item, and still backs the eco-swap recommendations.

        Exception: items resolved by exact dataset id (manual search, where
        the user picked the item directly) skip re-matching entirely —
        querying Climatiq could return a different product than the one
        actually selected."""
        if line_item.get("exact_match"):
            line_item.setdefault("source", "LOCAL_DATASET")
            return

        raw_item = line_item["raw_item"]
        qty = line_item["qty"]
        # The local dataset match already ran in process_receipt_items; its
        # canonical name (e.g. "Ground Beef") is a far cleaner Climatiq
        # search query than the raw, abbreviation-laden receipt text.
        query_hint = line_item["matched_item"] if line_item["status"] != "UNMATCHED" else None

        # Prefer the receipt's own weight when it lists one (more accurate
        # than any qty-based estimate); fall back to its printed price when
        # it doesn't.
        raw_weight = line_item.get("weight")
        weight_kg = _weight_to_kg(raw_weight, line_item.get("weight_unit")) if raw_weight is not None else None
        price_usd = line_item.get("price")

        if self.climatiq is not None:
            climatiq_result = self.climatiq.fetch_item_footprint(
                raw_item, qty, price_usd=price_usd, weight_kg=weight_kg, query_hint=query_hint
            )
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

        if line_item["status"] != "UNMATCHED":
            line_item.setdefault("source", "LOCAL_DATASET")
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
            status="ESTIMATED" if fallback_result["status"] == "FALLBACK_CLAUDE_ESTIMATED" else "UNMATCHED",
            source=fallback_result["status"],
        )
