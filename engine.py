import os
from typing import List

import pandas as pd  # type: ignore[import-unresolved]

from api_client import ClimatiqAPIClient
from calculator import process_receipt_items
from matcher import ReceiptMatcher
from ocr import OcrFailedError, OcrUnavailableError, extract_items_from_receipt

EMISSION_FACTORS_CSV = os.path.join(os.path.dirname(__file__), "emission_factors.csv")
KG_CO2E_PER_CAR_MILE = 0.404
KG_CO2E_ABSORBED_PER_TREE_YEAR = 21.77

__all__ = ["CarbonEngine", "OcrUnavailableError", "OcrFailedError"]


class CarbonEngine:
    """Run OCR, local matching, and Climatiq analysis without fabricated estimates."""

    def __init__(self):
        self.matcher = ReceiptMatcher(EMISSION_FACTORS_CSV)
        self.dataset_df = pd.read_csv(EMISSION_FACTORS_CSV)
        api_key = os.getenv("CLIMATIQ_API_KEY", "")
        self.climatiq = ClimatiqAPIClient(api_key) if api_key else None

    def analyze_receipt_image(
        self, image_bytes: bytes, content_type: str = "image/jpeg"
    ) -> dict:
        return self.analyze_receipt(extract_items_from_receipt(image_bytes, content_type))

    def analyze_receipt(self, parsed_items: List[dict]) -> dict:
        result = process_receipt_items(parsed_items, self.dataset_df, self.matcher)

        for line_item in result["line_items"]:
            if line_item["status"] != "UNMATCHED":
                line_item.setdefault("source", "LOCAL_DATASET")
                continue
            self._resolve_unmatched(line_item)

        self._refresh_summary(result)
        return result

    def _resolve_unmatched(self, line_item: dict) -> None:
        if self.climatiq is None:
            line_item.update(
                matched_item="Unmatched Item",
                source="CLIMATIQ_API",
                status="UNMATCHED",
                error="CLIMATIQ_API_KEY is not set",
            )
            return

        result = self.climatiq.fetch_item_footprint(
            line_item["raw_item"],
            line_item["qty"],
            line_item.get("price_usd"),
        )
        if result["status"] == "SUCCESS":
            line_item.update(
                matched_item=result["matched_item"],
                category=result["category"],
                item_co2e_kg=round(result["co2e_per_kg"], 2),
                confidence_score=0.6,
                status="MATCHED",
                source="CLIMATIQ_API",
                error="",
            )
        else:
            line_item.update(
                matched_item=result.get("matched_item", "Unmatched Item"),
                source=result.get("source", "CLIMATIQ_API"),
                status=result.get("status", "UNMATCHED"),
                error=result.get("error", ""),
            )

    @staticmethod
    def _refresh_summary(result: dict) -> None:
        category_totals = {}
        for item in result["line_items"]:
            category = item.get("category", "Uncategorized")
            value = float(item.get("item_co2e_kg", 0.0))
            category_totals[category] = round(category_totals.get(category, 0.0) + value, 2)
        total = round(sum(category_totals.values()), 2)
        result["summary"].update(
            total_co2e_kg=total,
            category_totals_kg=category_totals,
            equivalencies={
                "car_miles_driven": round(total / KG_CO2E_PER_CAR_MILE, 1),
                "trees_for_one_year": round(total / KG_CO2E_ABSORBED_PER_TREE_YEAR, 2),
            },
        )
