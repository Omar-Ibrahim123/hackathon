import unittest

from manual_items import ManualItemsError, parse_manual_items


class ManualItemsTests(unittest.TestCase):
    def test_parses_csv_with_price(self):
        result = parse_manual_items(
            b"raw_item,qty,price_usd\nbread,2,7.00\n",
            "items.csv",
        )
        self.assertEqual(result, [{"raw_item": "bread", "qty": 2.0, "price_usd": 7.0}])

    def test_parses_json_items(self):
        result = parse_manual_items(
            b'{"items":[{"raw_item":"oat milk","qty":1}]}',
            "items.json",
        )
        self.assertEqual(result, [{"raw_item": "oat milk", "qty": 1.0}])

    def test_rejects_invalid_quantity(self):
        with self.assertRaises(ManualItemsError):
            parse_manual_items(b"raw_item,qty\nbread,0\n", "items.csv")

    def test_rejects_missing_item_name(self):
        with self.assertRaises(ManualItemsError):
            parse_manual_items(b"raw_item,qty\n,1\n", "items.csv")


if __name__ == "__main__":
    unittest.main()
