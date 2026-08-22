"""Run the carbon engine against sample OCR output without an API key."""

import json

from engine import CarbonEngine


SAMPLE_RECEIPT = [
    {"raw_item": "BNDL GROUND BEEF 1LB", "qty": 2},
    {"raw_item": "ORG BREAD WHL WHT", "qty": 1},
    {"raw_item": "OATLY BARISTA OAT MILK", "qty": 1},
    {"raw_item": "UNKNOWN DRAGONFRUIT SNACK", "qty": 1},
]


if __name__ == "__main__":
    result = CarbonEngine().analyze_receipt(SAMPLE_RECEIPT)
    print(json.dumps(result, indent=2))
