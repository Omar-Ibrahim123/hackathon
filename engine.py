import os
from api_client import ClimatiqAPIClient

class CarbonEngine:
    def __init__(self):
        api_key = os.getenv("CLIMATIQ_API_KEY", "")
        self.client = ClimatiqAPIClient(api_key=api_key)

    def analyze_receipt(self, parsed_items: list) -> dict:
        line_items = []
        total_co2e = 0.0

        for item in parsed_items:
            raw_string = item.get("raw_item", "")
            qty = float(item.get("qty", 1.0))
            
            result = self.client.fetch_item_footprint(raw_string, qty)
            item_co2e = result.get("co2e_per_kg", 0.0)
            total_co2e += item_co2e

            line_items.append({
                "raw_item": raw_string,
                "matched_item": result.get("matched_item", "Unmatched Item"),
                "category": result.get("category", "Uncategorized"),
                "qty": qty,
                "item_co2e_kg": round(item_co2e, 2),
                "source": result.get("source", "CLIMATIQ_API"),
                "status": result.get("status", "UNMATCHED")
            })

        return {
            "summary": {
                "total_co2e_kg": round(total_co2e, 2),
                "total_items_processed": len(parsed_items)
            },
            "line_items": line_items
        }