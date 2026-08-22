import pandas as pd  # pyright: ignore[reportMissingModuleSource]
from matcher import ReceiptMatcher
from calculator import process_receipt_items
from fallback import estimate_unmatched_item

class CarbonEngine:
    def __init__(self, csv_path: str = "emission_factors.csv"):
        self.df = pd.read_csv(csv_path)
        self.matcher = ReceiptMatcher(csv_path)

    def analyze_receipt(self, parsed_items: list) -> dict:
        """
        Main pipeline function. Takes parsed OCR items from Codex/Vision pipeline,
        matches known items, runs Gemini fallback for unknown items, and returns
        complete footprint analysis for Person B's Streamlit frontend.
        """
        # 1. Run local fuzzy matching & emissions calculation
        results = process_receipt_items(parsed_items, self.df, self.matcher)

        # 2. Check for unmatched items and resolve using Gemini fallback
        for item in results["line_items"]:
            if item["status"] == "UNMATCHED":
                raw_string = item["raw_item"]
                fallback_data = estimate_unmatched_item(raw_string)
                
                # Update line item with Gemini estimates
                item["matched_item"] = fallback_data.get("item_name", raw_string)
                item["category"] = fallback_data.get("category", "Uncategorized")
                item["unit_weight_kg"] = fallback_data.get("default_unit_weight_kg", 0.5)
                
                # Recalculate emissions
                co2e_per_kg = fallback_data.get("co2e_per_kg", 1.5)
                item["item_co2e_kg"] = round(co2e_per_kg * item["unit_weight_kg"] * item["qty"], 2)
                item["status"] = fallback_data.get("status", "FALLBACK_ESTIMATED")

        # 3. Recalculate total footprint summary
        total_co2 = sum(item["item_co2e_kg"] for item in results["line_items"])
        results["summary"]["total_co2e_kg"] = round(total_co2, 2)

        return results

# --- Final Test ---
if __name__ == "__main__":
    engine = CarbonEngine()
    sample_receipt = [
        {"raw_item": "BNDL GROUND BEEF 1LB", "qty": 2},
        {"raw_item": "ORG BREAD WHL WHT", "qty": 1},
        {"raw_item": "DRAGONFRUIT BOBA JUICE", "qty": 1}  # Unknown item triggers fallback
    ]
    
    final_output = engine.analyze_receipt(sample_receipt)
    print("Final Analysis Complete!")
    print(f"Total Receipt Footprint: {final_output['summary']['total_co2e_kg']} kg CO2e")