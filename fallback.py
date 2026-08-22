import json
import os

import anthropic

MODEL = "claude-haiku-4-5"

DEFAULT_CO2E_PER_KG = 1.5  # rough average grocery-item factor
DEFAULT_UNIT_WEIGHT_KG = 0.5

CARBON_ESTIMATE_SCHEMA = {
    "type": "object",
    "properties": {
        "matched_item": {"type": "string"},
        "category": {"type": "string"},
        "co2e_per_kg": {"type": "number"},
        "default_unit_weight_kg": {"type": "number"},
        "reasoning": {"type": "string"},
    },
    "required": [
        "matched_item",
        "category",
        "co2e_per_kg",
        "default_unit_weight_kg",
        "reasoning",
    ],
    "additionalProperties": False,
}


def _default_estimate(raw_item_string: str, status: str) -> dict:
    return {
        "matched_item": raw_item_string,
        "category": "Uncategorized",
        "co2e_per_kg": DEFAULT_CO2E_PER_KG,
        "default_unit_weight_kg": DEFAULT_UNIT_WEIGHT_KG,
        "eco_swap_id": None,
        "confidence_score": 0.0,
        "status": status,
    }


def estimate_unmatched_item(raw_item_string: str) -> dict:
    """Uses Claude to estimate carbon emissions for items the local dataset
    and Climatiq API both failed to match. Degrades to a fixed average
    grocery-item factor if ANTHROPIC_API_KEY isn't configured or the call
    fails, so the pipeline never blocks on this step."""
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        return _default_estimate(raw_item_string, "FALLBACK_DEFAULT")

    client = anthropic.Anthropic(api_key=api_key)

    prompt = f"""
    Analyze this raw grocery receipt item string: "{raw_item_string}"
    Estimate its standard grocery category, its carbon footprint factor in
    kg CO2e per kg of product, and the typical purchased-package weight in
    kg for one unit of this item.
    """

    try:
        response = client.messages.create(
            model=MODEL,
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
            output_config={
                "format": {"type": "json_schema", "schema": CARBON_ESTIMATE_SCHEMA}
            },
        )

        text = next(block.text for block in response.content if block.type == "text")
        data = json.loads(text)
        return {
            "matched_item": data.get("matched_item", raw_item_string),
            "category": data.get("category", "Uncategorized"),
            "co2e_per_kg": float(data.get("co2e_per_kg", DEFAULT_CO2E_PER_KG)),
            "default_unit_weight_kg": float(
                data.get("default_unit_weight_kg", DEFAULT_UNIT_WEIGHT_KG)
            ),
            "eco_swap_id": None,
            "confidence_score": 0.5,
            "status": "FALLBACK_CLAUDE_ESTIMATED",
        }

    except Exception as e:
        print(f"[Warning] Claude fallback failed: {e}")
        return _default_estimate(raw_item_string, "FALLBACK_ERROR")


# --- Example Usage ---
if __name__ == "__main__":
    obscure_item = "KIRKLAND EX VIRG DRAGONFRUIT JUICE 1L"
    result = estimate_unmatched_item(obscure_item)
    print(json.dumps(result, indent=2))
