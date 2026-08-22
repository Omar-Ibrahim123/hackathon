import importlib
import json
import os

try:
    # Imported dynamically so static analyzers / environments without the
    # optional google-genai SDK installed don't need it just to import this
    # module.
    genai = importlib.import_module("google.genai")
    types = genai.types
except ImportError:
    genai = None
    types = None

DEFAULT_CO2E_PER_KG = 1.5  # rough average grocery-item factor
DEFAULT_UNIT_WEIGHT_KG = 0.5

CARBON_ESTIMATE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "matched_item": {"type": "STRING"},
        "category": {"type": "STRING"},
        "co2e_per_kg": {"type": "NUMBER"},
        "default_unit_weight_kg": {"type": "NUMBER"},
        "reasoning": {"type": "STRING"},
    },
    "required": [
        "matched_item",
        "category",
        "co2e_per_kg",
        "default_unit_weight_kg",
        "reasoning",
    ],
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
    """Uses Gemini to estimate carbon emissions for items the local dataset
    and Climatiq API both failed to match. Degrades to a fixed average
    grocery-item factor if GEMINI_API_KEY isn't configured or the call
    fails, so the pipeline never blocks on this step."""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key or genai is None or types is None:
        return _default_estimate(raw_item_string, "FALLBACK_DEFAULT")

    client = genai.Client(api_key=api_key)

    prompt = f"""
    Analyze this raw grocery receipt item string: "{raw_item_string}"
    Estimate its standard grocery category, its carbon footprint factor in
    kg CO2e per kg of product, and the typical purchased-package weight in
    kg for one unit of this item.
    """

    try:
        response = client.models.generate_content(
            model="gemini-3.6-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=CARBON_ESTIMATE_SCHEMA,
            ),
        )

        data = json.loads(response.text)
        return {
            "matched_item": data.get("matched_item", raw_item_string),
            "category": data.get("category", "Uncategorized"),
            "co2e_per_kg": float(data.get("co2e_per_kg", DEFAULT_CO2E_PER_KG)),
            "default_unit_weight_kg": float(
                data.get("default_unit_weight_kg", DEFAULT_UNIT_WEIGHT_KG)
            ),
            "eco_swap_id": None,
            "confidence_score": 0.5,
            "status": "FALLBACK_GEMINI_ESTIMATED",
        }

    except Exception as e:
        print(f"[Warning] Gemini fallback failed: {e}")
        return _default_estimate(raw_item_string, "FALLBACK_ERROR")


# --- Example Usage ---
if __name__ == "__main__":
    obscure_item = "KIRKLAND EX VIRG DRAGONFRUIT JUICE 1L"
    result = estimate_unmatched_item(obscure_item)
    print(json.dumps(result, indent=2))
