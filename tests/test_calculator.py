from pathlib import Path

import pandas as pd

from calculator import build_eco_swap_recommendations
from matcher import ReceiptMatcher


DATASET = Path(__file__).parents[1] / "emission_factors.csv"


def test_builds_sorted_swaps_from_final_line_item_emissions():
    dataset = pd.read_csv(DATASET)
    matcher = ReceiptMatcher(str(DATASET))
    line_items = [
        {
            "raw_item": "BNDL GROUND BEEF 1LB",
            "matched_item": "Ground Beef",
            "qty": 2.0,
            "item_co2e_kg": 30.0,
        },
        {
            "raw_item": "CHEDDAR CHEESE",
            "matched_item": "Cheddar Cheese",
            "qty": 1.0,
            "item_co2e_kg": 5.0,
        },
    ]

    recommendations = build_eco_swap_recommendations(
        line_items, dataset, matcher
    )

    assert recommendations == [
        {
            "original_item": "Ground Beef",
            "original_co2e_kg": 30.0,
            "recommended_swap": "Lentils",
            "swap_co2e_kg": 0.81,
            "potential_savings_kg": 29.19,
        },
        {
            "original_item": "Cheddar Cheese",
            "original_co2e_kg": 5.0,
            "recommended_swap": "Plant-Based Cheese",
            "swap_co2e_kg": 0.75,
            "potential_savings_kg": 4.25,
        },
    ]


def test_omits_swap_when_final_original_is_not_higher_than_replacement():
    dataset = pd.read_csv(DATASET)
    matcher = ReceiptMatcher(str(DATASET))
    line_items = [
        {
            "raw_item": "BNDL GROUND BEEF 1LB",
            "matched_item": "Ground Beef",
            "qty": 1.0,
            "item_co2e_kg": 0.1,
        },
    ]

    assert build_eco_swap_recommendations(line_items, dataset, matcher) == []
