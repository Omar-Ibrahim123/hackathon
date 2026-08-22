import pandas as pd  # type: ignore[import-unresolved]
from importlib import import_module
from typing import Any

# Load the local matcher module without requiring the editor to resolve it as a
# separately installed package.
ReceiptMatcher: Any = import_module("matcher").ReceiptMatcher

def process_receipt_items(parsed_items: list, dataset_df: pd.DataFrame, matcher: Any) -> dict:
    """
    Calculates total footprint and generates eco-swap recommendations.
    
    Args:
        parsed_items: List of dicts, e.g., [{"raw_item": "BNDL GROUND BEEF", "qty": 2}]
        dataset_df: Pandas DataFrame containing the emission factors
        matcher: Initialized ReceiptMatcher instance
    """
    # Create a quick dictionary lookup for eco-swaps based on 'id'
    id_map = dataset_df.set_index("id").to_dict(orient="index")
    
    line_items = []
    total_co2e = 0.0
    eco_swaps = []

    for item in parsed_items:
        raw_title = item.get("raw_item", "")
        qty = float(item.get("qty", 1.0))
        
        # 1. Match the item using the fuzzy engine
        match_res = matcher.match_item(raw_title)
        
        # 2. Handle unmatched items
        if match_res["status"] == "UNMATCHED":
            line_items.append({
                "raw_item": raw_title,
                "matched_item": "Unknown Item",
                "category": "Uncategorized",
                "qty": qty,
                "item_co2e_kg": 0.0,
                "confidence_score": 0.0,
                "status": "UNMATCHED"
            })
            continue

        # 3. Calculate item footprint: (co2e_per_kg) * (weight_per_unit) * (quantity)
        co2e_per_kg = match_res["co2e_per_kg"]
        unit_weight = match_res["default_unit_weight_kg"]
        item_co2e = round(co2e_per_kg * unit_weight * qty, 2)
        total_co2e += item_co2e

        line_items.append({
            "raw_item": raw_title,
            "matched_item": match_res["matched_item"],
            "category": match_res["category"],
            "qty": qty,
            "unit_weight_kg": unit_weight,
            "item_co2e_kg": item_co2e,
            "confidence_score": match_res["confidence_score"],
            "status": match_res["status"]
        })

        # 4. Check for eco-swaps and calculate potential carbon savings
        swap_id = match_res.get("eco_swap_id")
        if swap_id and swap_id in id_map:
            swap_data = id_map[swap_id]
            
            # Calculate footprint if they had bought the alternative
            swap_co2e_per_kg = swap_data["co2e_per_kg"]
            swap_unit_weight = swap_data["default_unit_weight_kg"]
            swap_item_co2e = round(swap_co2e_per_kg * swap_unit_weight * qty, 2)
            
            savings = round(item_co2e - swap_item_co2e, 2)
            
            # Only recommend if it actually saves carbon
            if savings > 0:
                eco_swaps.append({
                    "original_item": match_res["matched_item"],
                    "original_co2e_kg": item_co2e,
                    "recommended_swap": swap_data["item_name"],
                    "swap_co2e_kg": swap_item_co2e,
                    "potential_savings_kg": savings
                })

    # 5. Return a clean payload ready for Person B's Streamlit frontend
    return {
        "summary": {
            "total_co2e_kg": round(total_co2e, 2),
            "total_items_processed": len(parsed_items),
            "potential_total_savings_kg": round(sum(s["potential_savings_kg"] for s in eco_swaps), 2)
        },
        "line_items": line_items,
        "eco_swap_recommendations": sorted(eco_swaps, key=lambda x: x["potential_savings_kg"], reverse=True)
    }

# --- Example Usage ---
if __name__ == "__main__":
    df = pd.read_csv("emission_factors.csv")
    matcher = ReceiptMatcher("emission_factors.csv")
    
    parsed_sample = [
        {"raw_item": "BNDL GROUND BEEF 1LB", "qty": 2},
        {"raw_item": "ORG BREAD WHL WHT", "qty": 1},
        {"raw_item": "OATLY BARISTA OAT MILK", "qty": 1}
    ]
    
    result = process_receipt_items(parsed_sample, df, matcher)
    
    print(f"Total CO2e: {result['summary']['total_co2e_kg']} kg")
    print(f"Potential Savings: {result['summary']['potential_total_savings_kg']} kg\n")
    
    print("Top Eco Swap:")
    if result["eco_swap_recommendations"]:
        top_swap = result["eco_swap_recommendations"][0]
        print(f"Swap {top_swap['original_item']} for {top_swap['recommended_swap']} to save {top_swap['potential_savings_kg']} kg CO2e.")