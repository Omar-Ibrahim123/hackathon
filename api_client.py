import os
from typing import Optional

import requests

from matcher import ReceiptMatcher


class ClimatiqAPIClient:
    KNOWN_ACTIVITY_IDS = {
        "bread": {
            "activity_id": "consumer_goods-type_bread",
            "category": "Food",
            "unit_type": "Weight",
        }
    }

    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://api.climatiq.io/data/v1"
        self.data_version = os.getenv("CLIMATIQ_DATA_VERSION", "^33")
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    @staticmethod
    def _error_result(raw_item_string: str, message: str, source: str = "ERROR") -> dict:
        return {
            "raw_input": raw_item_string,
            "matched_item": "API Error",
            "category": "Uncategorized",
            "co2e_per_kg": 0.0,
            "source": source,
            "status": "API_FAILED",
            "error": message,
        }

    @staticmethod
    def _unmatched_result(raw_item_string: str) -> dict:
        return {
            "raw_input": raw_item_string,
            "matched_item": "Unmatched Item",
            "category": "Uncategorized",
            "co2e_per_kg": 0.0,
            "source": "CLIMATIQ_API",
            "status": "UNMATCHED",
        }

    @staticmethod
    def _search_candidates(query_text: str) -> list:
        """Progressively shorter suffixes of the query, most specific first.
        Climatiq's /search does exact-ish phrase matching rather than fuzzy
        matching, so a full multi-word phrase (e.g. "whole wheat bread") is
        often a zero-result miss even though a shorter core phrase within it
        ("wheat bread") is indexed. Dropping one leading word at a time
        keeps the trailing, most specific/noun-like part of the phrase for
        as long as possible."""
        tokens = ReceiptMatcher.normalize(query_text).split()
        candidates = [" ".join(tokens[i:]) for i in range(len(tokens))]
        return candidates or [query_text]

    def fetch_item_footprint(
        self,
        raw_item_string: str,
        qty: float = 1.0,
        price_usd: Optional[float] = None,
        query_hint: Optional[str] = None,
    ) -> dict:
        """
        Queries Climatiq for the item emission factor.
        Returns UNMATCHED only when Climatiq genuinely has no data for the
        item (a 200 with an empty result set); any request/API failure
        returns API_FAILED instead, so callers don't mistake one for the
        other.

        query_hint, when given (e.g. a clean canonical name like "Ground
        Beef" from the local dataset matcher), is searched instead of
        raw_item_string: raw receipt text carries brand/pack-size noise
        that Climatiq's search doesn't tolerate well.
        """
        if not self.api_key:
            return self._error_result(raw_item_string, "CLIMATIQ_API_KEY is not set")

        try:
            known_activity = self.KNOWN_ACTIVITY_IDS.get(raw_item_string.strip().lower())
            if known_activity:
                factor_id = known_activity["activity_id"]
                category = known_activity["category"]
                item_name = raw_item_string
                unit_type = known_activity["unit_type"]
            else:
                best_match = None
                for query in self._search_candidates(query_hint or raw_item_string):
                    search_response = requests.get(
                        f"{self.base_url}/search",
                        headers=self.headers,
                        params={
                            "query": query,
                            "data_version": self.data_version,
                            "results_per_page": 1,
                        },
                        timeout=3,
                    )
                    if search_response.status_code != 200:
                        return self._error_result(
                            raw_item_string,
                            self._response_message(search_response),
                            "CLIMATIQ_API",
                        )

                    results = search_response.json().get("results")
                    if results:
                        best_match = results[0]
                        break

                if best_match is None:
                    return self._unmatched_result(raw_item_string)

                factor_id = best_match.get("activity_id", best_match.get("id"))
                category = best_match.get("category", "Uncategorized")
                item_name = best_match.get("name", raw_item_string)
                unit_type = best_match.get("unit_type", "Weight")

            if unit_type == "Money":
                amount = price_usd if price_usd is not None else qty * 3.50
                parameters = {"money": round(amount, 2), "money_unit": "usd"}
            elif unit_type == "Weight":
                parameters = {"weight": round(qty * 0.5, 2), "weight_unit": "kg"}
            else:
                return self._error_result(
                    raw_item_string,
                    f"Unsupported Climatiq unit type: {unit_type}",
                    "CLIMATIQ_API",
                )

            estimate_response = requests.post(
                f"{self.base_url}/estimate",
                headers=self.headers,
                json={
                    "emission_factor": {
                        "activity_id": factor_id,
                        "data_version": self.data_version,
                    },
                    "parameters": parameters,
                },
                timeout=3,
            )
            if estimate_response.status_code != 200:
                return self._error_result(
                    raw_item_string,
                    self._response_message(estimate_response),
                    "CLIMATIQ_API",
                )

            estimate_data = estimate_response.json()
            return {
                "raw_input": raw_item_string,
                "matched_item": item_name,
                "category": category,
                "co2e_per_kg": estimate_data.get("co2e", 0.0),
                "source": "CLIMATIQ_API",
                "status": "SUCCESS",
            }
        except requests.exceptions.RequestException as error:
            return self._error_result(raw_item_string, str(error))

    @staticmethod
    def _response_message(response: requests.Response) -> str:
        try:
            data = response.json()
        except ValueError:
            return f"HTTP {response.status_code}"
        return data.get("message") or data.get("error") or f"HTTP {response.status_code}"
