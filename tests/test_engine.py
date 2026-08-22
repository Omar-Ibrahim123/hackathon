from engine import CarbonEngine


class FakeClimatiq:
    def fetch_item_footprint(self, raw_item, qty, **kwargs):
        return {
            "raw_input": raw_item,
            "matched_item": "Climatiq Ground Beef",
            "category": "Food",
            "co2e_per_kg": 10.0,
            "source": "CLIMATIQ_API",
            "status": "SUCCESS",
        }


def test_rebuilds_swaps_after_climatiq_changes_original_emissions():
    engine = CarbonEngine()
    engine.climatiq = FakeClimatiq()

    result = engine.analyze_receipt(
        [{"raw_item": "BNDL GROUND BEEF 1LB", "qty": 1}]
    )

    assert result["line_items"][0]["item_co2e_kg"] == 10.0
    assert result["eco_swap_recommendations"] == [
        {
            "original_item": "Climatiq Ground Beef",
            "original_co2e_kg": 10.0,
            "recommended_swap": "Lentils",
            "swap_co2e_kg": 0.41,
            "potential_savings_kg": 9.59,
        }
    ]
    assert result["summary"]["potential_total_savings_kg"] == 9.59
