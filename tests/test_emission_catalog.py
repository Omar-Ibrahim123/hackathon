import csv
from pathlib import Path

import pytest

from matcher import ReceiptMatcher


CATALOG_PATH = Path(__file__).parents[1] / "emission_factors.csv"


def load_catalog() -> list[dict[str, str]]:
    with CATALOG_PATH.open(newline="", encoding="utf-8") as catalog_file:
        return list(csv.DictReader(catalog_file))


def test_catalog_covers_at_least_150_normalized_foods() -> None:
    assert len(load_catalog()) >= 150


def test_catalog_rows_have_valid_ids_values_and_swap_targets() -> None:
    rows = load_catalog()
    ids = [row["id"] for row in rows]
    id_set = set(ids)

    assert len(ids) == len(id_set)
    for row in rows:
        assert row["item_name"].strip()
        assert row["category"].strip()
        assert float(row["co2e_per_kg"]) > 0
        assert float(row["default_unit_weight_kg"]) > 0
        assert row["keywords"].strip()
        assert not row["eco_swap_id"] or row["eco_swap_id"] in id_set
        assert row["eco_swap_id"] != row["id"]


def test_every_configured_swap_reduces_the_default_item_footprint() -> None:
    rows = load_catalog()
    rows_by_id = {row["id"]: row for row in rows}

    for original in rows:
        if not original["eco_swap_id"]:
            continue
        replacement = rows_by_id[original["eco_swap_id"]]
        original_footprint = float(original["co2e_per_kg"]) * float(
            original["default_unit_weight_kg"]
        )
        replacement_footprint = float(replacement["co2e_per_kg"]) * float(
            replacement["default_unit_weight_kg"]
        )

        assert replacement_footprint < original_footprint, (
            f'{original["item_name"]} -> {replacement["item_name"]} '
            "does not lower the default item footprint"
        )


@pytest.mark.parametrize(
    ("receipt_text", "expected_item"),
    [
        ("BNLS SKNLS CHKN THGHS 2LB", "Chicken Thighs"),
        ("ATLANTIC COD FILLETS 1LB", "Cod"),
        ("BLK BEANS CANNED 15OZ", "Black Beans"),
        ("BRUSSEL SPROUTS 1LB", "Brussels Sprouts"),
        ("PEANUT BUTTER CRM 16OZ", "Peanut Butter"),
        ("SPARKLING WATER 12PK", "Sparkling Water"),
        ("BEEF BURGER PATTIES 4PK", "Beef Burger"),
        ("VEGGIE BURGER PATTIES 4PK", "Plant-Based Burger"),
    ],
)
def test_catalog_matches_broad_receipt_vocabulary(
    receipt_text: str,
    expected_item: str,
) -> None:
    matcher = ReceiptMatcher(str(CATALOG_PATH))

    result = matcher.match_item(receipt_text)

    assert result["status"] == "MATCHED"
    assert result["matched_item"] == expected_item
