import unittest
from unittest.mock import patch

from api_client import ClimatiqAPIClient
from calculator import LocalReceiptMatcher
from engine import CarbonEngine


class FakeResponse:
    def __init__(self, status_code, payload):
        self.status_code = status_code
        self.payload = payload

    def json(self):
        return self.payload


class BackendTests(unittest.TestCase):
    def test_missing_key_returns_api_failure(self):
        result = ClimatiqAPIClient("").fetch_item_footprint("ground beef", qty=2)

        self.assertEqual(result["status"], "API_FAILED")
        self.assertEqual(result["source"], "ERROR")
        self.assertEqual(result["error"], "CLIMATIQ_API_KEY is not set")

    def test_engine_returns_categories_and_equivalencies(self):
        class StubClient:
            def fetch_item_footprint(self, item, qty):
                return {
                    "matched_item": item,
                    "category": "Food",
                    "item_co2e_kg": qty,
                    "source": "TEST",
                    "status": "SUCCESS",
                }

        result = CarbonEngine(StubClient()).analyze_receipt([
            {"raw_item": "test item one", "qty": 2},
            {"raw_item": "test item two", "qty": 1},
        ])

        self.assertEqual(result["summary"]["total_co2e_kg"], 3.0)
        self.assertEqual(result["summary"]["category_totals_kg"], {"Food": 3.0})
        self.assertEqual(len(result["line_items"]), 2)
        self.assertGreater(result["summary"]["equivalencies"]["car_miles_driven"], 0)

    @patch("api_client.requests.post")
    @patch("api_client.requests.get")
    def test_bread_uses_direct_activity_id(self, get_request, post_request):
        post_request.return_value = FakeResponse(200, {"co2e": 1.2})
        result = ClimatiqAPIClient("test-key").fetch_item_footprint("bread")

        get_request.assert_not_called()
        body = post_request.call_args.kwargs["json"]
        self.assertEqual(body["emission_factor"]["activity_id"], "consumer_goods-type_bread")
        self.assertEqual(body["emission_factor"]["data_version"], "^33")
        self.assertEqual(body["parameters"], {"weight": 0.5, "weight_unit": "kg"})
        self.assertEqual(result["status"], "SUCCESS")

    @patch("api_client.requests.post")
    @patch("api_client.requests.get")
    def test_money_factor_uses_money_parameters(self, get_request, post_request):
        get_request.return_value = FakeResponse(200, {
            "results": [{"id": "service", "name": "Service", "unit_type": "Money"}]
        })
        post_request.return_value = FakeResponse(200, {"co2e": 1.2})

        result = ClimatiqAPIClient("test-key").fetch_item_footprint(
            "service", qty=2, price_usd=8.75
        )

        self.assertEqual(
            post_request.call_args.kwargs["json"]["parameters"],
            {"money": 8.75, "money_unit": "usd"},
        )
        self.assertEqual(result["status"], "SUCCESS")

    @patch("api_client.requests.get")
    def test_http_error_returns_api_failure_and_preserves_message(self, get_request):
        get_request.return_value = FakeResponse(400, {"message": "Invalid query"})
        result = ClimatiqAPIClient("test-key").fetch_item_footprint("unknown")

        self.assertEqual(result["status"], "API_FAILED")
        self.assertEqual(result["error"], "Invalid query")

    def test_matcher_rejects_unrelated_products(self):
        matcher = LocalReceiptMatcher([
            {"item_name": "potatoes", "category": "Produce"},
            {"item_name": "bread", "category": "Bakery"},
        ])

        for item in ("PAPER TOWELS", "SHAMPOO"):
            self.assertEqual(matcher.match_item(item)["status"], "UNMATCHED")


if __name__ == "__main__":
    unittest.main()
