import os

import pandas as pd  # type: ignore[import-unresolved]

from api_client import ClimatiqAPIClient
from calculator import build_eco_swap_recommendations, process_receipt_items
from fallback import estimate_unmatched_item
from matcher import ReceiptMatcher, is_boilerplate_line
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
    """Ties the whole EcoReceipt pipeline together: OCR -> local dataset
    match -> Climatiq API match -> Claude estimate, in that order. The
    local CSV is tried first and trusted whenever it finds a match, since
    it's curated for grocery categories and only accepts matches backed by
    real word/keyword evidence (see matcher.py). Climatiq's free-text
    search has no such guardrails and can resolve a short/generic query to
    a wildly wrong sector (e.g. "chips" hitting a wood-chip biomass factor
    instead of the snack food), so it's only consulted for items the local
    dataset couldn't identify at all. Claude is the last resort for
    anything neither source recognizes."""

    def __init__(self):
        self.matcher = ReceiptMatcher(EMISSION_FACTORS_CSV)
        self.dataset_df = pd.read_csv(EMISSION_FACTORS_CSV)

        climatiq_key = os.getenv("CLIMATIQ_API_KEY", "")
        self.climatiq = ClimatiqAPIClient(api_key=climatiq_key) if climatiq_key else None

    def analyze_receipt_image(self, image_bytes: bytes, content_type: str = "image/jpeg") -> dict:
        parsed_items = extract_items_from_receipt(image_bytes, content_type)
        return self.analyze_receipt(parsed_items)

    def analyze_receipt(self, parsed_items: list) -> dict:
        # Receipt OCR (and any client hitting /api/receipts/analyze
        # directly) can hand us non-merchandise lines - subtotal, tax,
        # payment method, transaction metadata - despite being told not to.
        # Drop those before they're ever treated as a purchased item, since
        # matching them against the local dataset or Climatiq only risks a
        # bogus category (e.g. "TOTAL" resolving to an unrelated industrial
        # manufacturing activity) rather than the correct answer of "not a
        # product".
        parsed_items = [
            item for item in parsed_items
            if not is_boilerplate_line(item.get("raw_item", ""))
        ]
        result = process_receipt_items(parsed_items, self.dataset_df, self.matcher)

        for line_item in result["line_items"]:
            self._resolve_line_item(line_item)

        result["summary"]["total_co2e_kg"] = round(
            sum(item["item_co2e_kg"] for item in result["line_items"]), 2
        )
        recommendations = build_eco_swap_recommendations(
            result["line_items"], self.dataset_df, self.matcher
        )
        result["eco_swap_recommendations"] = recommendations
        result["summary"]["potential_total_savings_kg"] = round(
            sum(
                recommendation["potential_savings_kg"]
                for recommendation in recommendations
            ),
            2,
        )

        return result

    def _resolve_line_item(self, line_item: dict) -> None:
        """Prefer Climatiq when configured, retaining the local catalog
        match when the provider cannot resolve the item."""
        raw_item = line_item["raw_item"]
        qty = line_item["qty"]
        query_hint = (
            line_item["matched_item"]
            if line_item["status"] != "UNMATCHED"
            else None
        )

        # Prefer the receipt's own weight when it lists one (more accurate
        # than any qty-based estimate); fall back to its printed price when
        # it doesn't.
        raw_weight = line_item.get("weight")
        weight_kg = _weight_to_kg(raw_weight, line_item.get("weight_unit")) if raw_weight is not None else None
        price_usd = line_item.get("price")

        if self.climatiq is not None:
            climatiq_result = self.climatiq.fetch_item_footprint(
                raw_item,
                qty,
                price_usd=price_usd,
                weight_kg=weight_kg,
                query_hint=query_hint,
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
