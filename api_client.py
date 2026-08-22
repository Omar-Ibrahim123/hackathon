import os
import requests
from fallback import estimate_unmatched_item # Your Gemini fallback from Step 4

class ClimatiqAPIClient:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://api.climatiq.io/data/v1"
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

    def fetch_item_footprint(self, raw_item_string: str, qty: float = 1.0) -> dict:
        """
        1. Searches Climatiq for the best emission factor ID.
        2. Calculates the emission estimate based on the ID.
        3. Falls back to Gemini if Climatiq returns no results.
        """
        # STEP 1: Search for the emission factor ID
        search_url = f"{self.base_url}/search"
        search_params = {
            "query": raw_item_string,
            "results_per_page": 1 # We only need the top match
        }
        
        try:
            search_response = requests.get(
                search_url, 
                headers=self.headers, 
                params=search_params, 
                timeout=3
            )
            
            if search_response.status_code == 200:
                search_data = search_response.json()
                
                # If Climatiq found a matching emission factor
                if search_data.get("results"):
                    best_match = search_data["results"][0]
                    factor_id = best_match["id"]
                    category = best_match.get("category", "Uncategorized")
                    item_name = best_match.get("name", raw_item_string)
                    unit_type = best_match.get("unit_type", "Weight") # e.g., Weight, Money, Volume
                    
                    # STEP 2: Calculate the exact footprint using the POST /estimate endpoint
                    estimate_url = f"{self.base_url}/estimate"
                    
                    # We have to dynamically set the parameter based on what unit Climatiq expects
                    # For a hackathon, we can default to weight (kg) or money (usd) based on unit_type
                    calc_params = {}
                    if unit_type == "Money":
                        calc_params = {"money": qty * 5.0, "money_unit": "usd"} # Mocking $5 per item
                    else:
                        calc_params = {"weight": qty * 0.5, "weight_unit": "kg"} # Mocking 0.5kg per item

                    payload = {
                        "emission_factor": {"id": factor_id},
                        "parameters": calc_params
                    }
                    
                    estimate_response = requests.post(
                        estimate_url,
                        headers=self.headers,
                        json=payload,
                        timeout=3
                    )
                    
                    if estimate_response.status_code == 200:
                        estimate_data = estimate_response.json()
                        return {
                            "raw_input": raw_item_string,
                            "matched_item": item_name,
                            "category": category,
                            "co2e_per_kg": estimate_data.get("co2e", 0),
                            "source": "CLIMATIQ_API",
                            "status": "SUCCESS"
                        }

            # If Climatiq returns 404, empty results, or the estimate fails, trigger Gemini fallback
            print(f"[Info] '{raw_item_string}' failed in Climatiq. Falling back to Gemini.")
            return estimate_unmatched_item(raw_item_string)

        except requests.exceptions.RequestException as e:
            print(f"[Warning] Climatiq API Request failed: {e}. Routing to Gemini.")
            return estimate_unmatched_item(raw_item_string)

# --- Example Usage ---
if __name__ == "__main__":
    # Ensure your actual Climatiq API key is set as an environment variable
    # e.g., export CLIMATIQ_API_KEY="your_api_key_here"
    api_key = os.getenv("CLIMATIQ_API_KEY", "dummy_key") 
    client = ClimatiqAPIClient(api_key=api_key)
    
    test_item = "OATLY BARISTA OAT MILK"
    result = client.fetch_item_footprint(test_item, qty=1.0)
    
    print(f"Result for '{test_item}':")
    print(f"Matched: {result.get('matched_item')} | CO2e: {result.get('co2e_per_kg')} | Source: {result.get('source')}")