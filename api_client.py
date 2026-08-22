import os
import requests

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
        Queries Climatiq for the item emission factor.
        Returns UNMATCHED if Climatiq has no data for the item.
        """
        search_url = f"{self.base_url}/search"
        search_params = {
            "query": raw_item_string,
            "results_per_page": 1
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
                
                if search_data.get("results"):
                    best_match = search_data["results"][0]
                    factor_id = best_match["id"]
                    category = best_match.get("category", "Uncategorized")
                    item_name = best_match.get("name", raw_item_string)
                    unit_type = best_match.get("unit_type", "Weight")
                    
                    estimate_url = f"{self.base_url}/estimate"
                    calc_params = (
                        {"money": qty * 5.0, "money_unit": "usd"}
                        if unit_type == "Money"
                        else {"weight": qty * 0.5, "weight_unit": "kg"}
                    )

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
                            "co2e_per_kg": estimate_data.get("co2e", 0.0),
                            "source": "CLIMATIQ_API",
                            "status": "SUCCESS"
                        }

            # If Climatiq yields no results, mark as unmatched
            return {
                "raw_input": raw_item_string,
                "matched_item": "Unmatched Item",
                "category": "Uncategorized",
                "co2e_per_kg": 0.0,
                "source": "CLIMATIQ_API",
                "status": "UNMATCHED"
            }

        except requests.exceptions.RequestException as e:
            print(f"[Warning] Climatiq API Request failed: {e}")
            return {
                "raw_input": raw_item_string,
                "matched_item": "API Error",
                "category": "Uncategorized",
                "co2e_per_kg": 0.0,
                "source": "ERROR",
                "status": "API_FAILED"
            }