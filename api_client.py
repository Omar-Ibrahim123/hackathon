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
        # Climatiq's /search requires an explicit data_version. Prefer a
        # pinned value from the environment (stable across deploys); fall
        # back to querying /data-versions for the current dynamic version.
        self._data_version = os.getenv("CLIMATIQ_DATA_VERSION")

    def _get_data_version(self) -> str:
        if self._data_version:
            return self._data_version

        response = requests.get(
            f"{self.base_url}/data-versions",
            headers=self.headers,
            timeout=3,
        )
        response.raise_for_status()
        latest_release = response.json()["latest_release"]
        self._data_version = f"^{latest_release}"
        return self._data_version

    @staticmethod
    def _error_result(raw_item_string: str) -> dict:
        return {
            "raw_input": raw_item_string,
            "matched_item": "API Error",
            "category": "Uncategorized",
            "co2e_per_kg": 0.0,
            "source": "ERROR",
            "status": "API_FAILED"
        }

    @staticmethod
    def _unmatched_result(raw_item_string: str) -> dict:
        return {
            "raw_input": raw_item_string,
            "matched_item": "Unmatched Item",
            "category": "Uncategorized",
            "co2e_per_kg": 0.0,
            "source": "CLIMATIQ_API",
            "status": "UNMATCHED"
        }

    def fetch_item_footprint(self, raw_item_string: str, qty: float = 1.0) -> dict:
        """
        Queries Climatiq for the item emission factor.
        Returns UNMATCHED only when Climatiq genuinely has no data for the
        item (a 200 with an empty result set); any request/API failure
        returns API_FAILED instead, so callers don't mistake one for the
        other.
        """
        search_url = f"{self.base_url}/search"

        try:
            search_params = {
                "query": raw_item_string,
                "data_version": self._get_data_version(),
                "results_per_page": 1
            }

            search_response = requests.get(
                search_url,
                headers=self.headers,
                params=search_params,
                timeout=3
            )

            if search_response.status_code != 200:
                print(
                    f"[Warning] Climatiq search failed: "
                    f"{search_response.status_code} {search_response.text}"
                )
                return self._error_result(raw_item_string)

            search_data = search_response.json()

            if not search_data.get("results"):
                return self._unmatched_result(raw_item_string)

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

            if estimate_response.status_code != 200:
                print(
                    f"[Warning] Climatiq estimate failed: "
                    f"{estimate_response.status_code} {estimate_response.text}"
                )
                return self._error_result(raw_item_string)

            estimate_data = estimate_response.json()
            return {
                "raw_input": raw_item_string,
                "matched_item": item_name,
                "category": category,
                "co2e_per_kg": estimate_data.get("co2e", 0.0),
                "source": "CLIMATIQ_API",
                "status": "SUCCESS"
            }

        except requests.exceptions.RequestException as e:
            print(f"[Warning] Climatiq API Request failed: {e}")
            return self._error_result(raw_item_string)
