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

    def _search_best_match(self, candidates: list, unit_type: Optional[str] = None):
        """Runs candidate queries against Climatiq's /search, most specific
        first, optionally filtered to a preferred unit_type (Climatiq
        supports filtering search results by unit_type directly). Returns
        (best_match, error_message); error_message is set only on an actual
        request failure, not on a genuine no-results miss."""
        for query in candidates:
            params = {
                "query": query,
                "data_version": self.data_version,
                "results_per_page": 1,
            }
            if unit_type:
                params["unit_type"] = unit_type
            response = requests.get(
                f"{self.base_url}/search", headers=self.headers, params=params, timeout=3
            )
            if response.status_code != 200:
                return None, self._response_message(response)

            results = response.json().get("results")
            if results:
                return results[0], None
        return None, None

    @staticmethod
    def _search_candidates(query_text: str) -> list:
        """Progressively shorter suffixes of the query, most specific first.
        Climatiq's /search does exact-ish phrase matching rather than fuzzy
        matching, so a full multi-word phrase (e.g. "whole wheat bread") is
        often a zero-result miss even though a shorter core phrase within it
        ("wheat bread") is indexed. Dropping one leading word at a time
        keeps the trailing, most specific/noun-like part of the phrase for
        as long as possible.

        Never drops below two words when the query has that many: a single
        leftover generic word (e.g. "chili" out of "Doritos Chili") is
        exactly the kind of query Climatiq's search will happily resolve to
        an unrelated activity in some other sector (a spice, a place name,
        a random processed-meat product) rather than reporting no match.
        """
        tokens = ReceiptMatcher.normalize(query_text).split()
        if not tokens:
            return [query_text]
        min_words = min(2, len(tokens))
        candidates = [
            " ".join(tokens[i:]) for i in range(len(tokens) - min_words + 1)
        ]
        return candidates

    def fetch_item_footprint(
        self,
        raw_item_string: str,
        qty: float = 1.0,
        price_usd: Optional[float] = None,
        weight_kg: Optional[float] = None,
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

        weight_kg / price_usd are the actual weight or price printed for
        this line item on the receipt. Weight is preferred whenever the
        receipt lists one, since it's a direct physical quantity rather
        than a qty-based guess; price is the fallback when the receipt
        doesn't list a weight. Whichever is available also biases which
        Climatiq factor gets matched (Climatiq's /search accepts a
        unit_type filter), so a weight-listed item is matched against a
        Weight-type factor and a weight-less item against a Money-type one
        wherever Climatiq has that option for it.
        """
        if not self.api_key:
            return self._error_result(raw_item_string, "CLIMATIQ_API_KEY is not set")

        preferred_unit_type = "Weight" if weight_kg is not None else ("Money" if price_usd is not None else None)

        try:
            known_activity = self.KNOWN_ACTIVITY_IDS.get(raw_item_string.strip().lower())
            if known_activity:
                factor_id = known_activity["activity_id"]
                category = known_activity["category"]
                item_name = raw_item_string
                unit_type = known_activity["unit_type"]
            else:
                candidates = self._search_candidates(query_hint or raw_item_string)
                best_match, error_message = self._search_best_match(candidates, preferred_unit_type)
                if best_match is None and preferred_unit_type and error_message is None:
                    # Climatiq may not have a factor of the preferred type
                    # for this item; retry unfiltered rather than reporting
                    # a false UNMATCHED.
                    best_match, error_message = self._search_best_match(candidates)
                if error_message is not None:
                    return self._error_result(raw_item_string, error_message, "CLIMATIQ_API")
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
                amount = weight_kg if weight_kg is not None else qty * 0.5
                parameters = {"weight": round(amount, 2), "weight_unit": "kg"}
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
