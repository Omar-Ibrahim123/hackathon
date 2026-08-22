from difflib import SequenceMatcher
from typing import Any


class LocalReceiptMatcher:
    """Dependency-free fuzzy matcher for local emission-factor rows."""

    def __init__(self, factors: list[dict[str, Any]], threshold: float = 0.45):
        self.factors = factors
        self.threshold = threshold

    def match_item(self, raw_item: str) -> dict[str, Any]:
        normalized = raw_item.strip().lower()
        best_factor = None
        best_score = 0.0
        for factor in self.factors:
            candidate = str(factor.get("item_name", "")).lower()
            score = 1.0 if candidate and candidate in normalized else SequenceMatcher(
                None, normalized, candidate
            ).ratio()
            if score > best_score:
                best_factor, best_score = factor, score
        if best_factor is None or best_score < self.threshold:
            return {"status": "UNMATCHED", "confidence_score": round(best_score, 3)}
        return {
            **best_factor,
            "matched_item": best_factor["item_name"],
            "confidence_score": round(best_score, 3),
            "status": "SUCCESS",
        }


def _factor_rows(dataset: Any) -> list[dict[str, Any]]:
    if hasattr(dataset, "to_dict"):
        return dataset.to_dict(orient="records")
    return list(dataset)


def process_receipt_items(
    parsed_items: list[dict[str, Any]],
    dataset: Any,
    matcher: LocalReceiptMatcher | None = None,
) -> dict[str, Any]:
    """Match receipt items, calculate footprints, and recommend eco-swaps."""
    factors = _factor_rows(dataset)
    matcher = matcher or LocalReceiptMatcher(factors)
    by_id = {factor.get("id"): factor for factor in factors}
    line_items = []
    recommendations = []
    category_totals: dict[str, float] = {}

    for item in parsed_items:
        raw_item = str(item.get("raw_item", ""))
        qty = float(item.get("qty", 1.0))
        match = matcher.match_item(raw_item)
        if match.get("status") == "UNMATCHED":
            line_items.append({
                "raw_item": raw_item,
                "matched_item": "Unknown Item",
                "category": "Uncategorized",
                "qty": qty,
                "item_co2e_kg": 0.0,
                "confidence_score": match.get("confidence_score", 0.0),
                "status": "UNMATCHED",
            })
            continue

        unit_weight = float(match.get("default_unit_weight_kg", 0.0))
        item_co2e = round(float(match.get("co2e_per_kg", 0.0)) * unit_weight * qty, 2)
        category = match.get("category", "Uncategorized")
        category_totals[category] = round(category_totals.get(category, 0.0) + item_co2e, 2)
        line_items.append({
            "raw_item": raw_item,
            "matched_item": match["matched_item"],
            "category": category,
            "qty": qty,
            "unit_weight_kg": unit_weight,
            "item_co2e_kg": item_co2e,
            "confidence_score": match["confidence_score"],
            "status": "SUCCESS",
        })

        swap = by_id.get(match.get("eco_swap_id"))
        if swap:
            swap_co2e = round(
                float(swap.get("co2e_per_kg", 0.0))
                * float(swap.get("default_unit_weight_kg", 0.0))
                * qty,
                2,
            )
            savings = round(item_co2e - swap_co2e, 2)
            if savings > 0:
                recommendations.append({
                    "original_item": match["matched_item"],
                    "recommended_swap": swap["item_name"],
                    "original_co2e_kg": item_co2e,
                    "swap_co2e_kg": swap_co2e,
                    "potential_savings_kg": savings,
                })

    total_co2e = round(sum(item["item_co2e_kg"] for item in line_items), 2)
    recommendations.sort(key=lambda item: item["potential_savings_kg"], reverse=True)
    return {
        "summary": {
            "total_co2e_kg": total_co2e,
            "total_items_processed": len(parsed_items),
            "category_totals_kg": category_totals,
            "potential_total_savings_kg": round(
                sum(item["potential_savings_kg"] for item in recommendations), 2
            ),
        },
        "line_items": line_items,
        "eco_swap_recommendations": recommendations,
    }
