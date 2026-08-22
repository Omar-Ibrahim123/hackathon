import os
import json

try:
    # Import the optional SDK dynamically so static analyzers do not require
    # google-genai to be installed in every environment.
    import importlib

    genai = importlib.import_module("google.genai")
    types = genai.types
except ImportError:
    genai = None
    types = None

# Define structured output schema for reliable JSON responses without requiring
# the optional pydantic package at runtime.
CARBON_ESTIMATE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "item_name": {"type": "STRING"},
        "category": {"type": "STRING"},
        "co2e_per_kg": {"type": "NUMBER"},
        "default_unit_weight_kg": {"type": "NUMBER"},
        "reasoning": {"type": "STRING"},
    },
    "required": [
        "item_name",
        "category",
        "co2e_per_kg",
        "default_unit_weight_kg",
        "reasoning",
    ],
}

def estimate_unmatched_item(raw_item_string: str) -> dict:
    """
    Uses Gemini to estimate carbon emissions for obscure or unlisted receipt items.
    """
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key or genai is None or types is None:
        print("[Warning] GEMINI_API_KEY environment variable not set.")
        return {
            "matched_item": raw_item_string,
            "category": "Uncategorized",
            "co2e_per_kg": 1.5,  # Fallback default average grocery factor
            "default_unit_weight_kg": 0.5,
            "status": "FALLBACK_DEFAULT"
        }

    client = genai.Client(api_key=api_key)

    prompt = f"""
    Analyze this raw receipt item string: "{raw_item_string}"
    Estimate its standard food/grocery category, its carbon footprint factor in kg CO2e per kg, 
    and the typical unit weight in kg for one item or package.
    """

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=CARBON_ESTIMATE_SCHEMA,
                temperature=0.2
            )
        )
        
        data = json.loads(response.text)
        data["status"] = "FALLBACK_GEMINI_ESTIMATED"
        return data

    except Exception as e:
        print(f"[Error] Gemini API fallback failed: {e}")
        return {
            "matched_item": raw_item_string,
            "category": "Uncategorized",
            "co2e_per_kg": 1.5,
            "default_unit_weight_kg": 0.5,
            "status": "FALLBACK_ERROR"
        }

# --- Example Usage ---
if __name__ == "__main__":
    # Test on an obscure receipt item not in your local CSV
    obscure_item = "KIRKLAND EX VIRG DRAGONFRUIT JUICE 1L"
    result = estimate_unmatched_item(obscure_item)
    print("Gemini Fallback Output:")
    print(json.dumps(result, indent=2))