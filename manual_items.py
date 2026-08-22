"""Parse manually supplied receipt items from CSV or JSON files."""

import csv
import io
import json
import math
from typing import Any, Dict, List


class ManualItemsError(ValueError):
    """Raised when a manual item upload does not match the input contract."""


def parse_manual_items(file_bytes: bytes, filename: str) -> List[Dict[str, Any]]:
    """Parse an upload containing raw_item, qty, and optional price_usd fields."""
    try:
        text = file_bytes.decode("utf-8-sig")
    except UnicodeDecodeError as error:
        raise ManualItemsError("The file must be UTF-8 encoded.") from error

    extension = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    try:
        if extension == "json":
            payload = json.loads(text)
            rows = payload.get("items") if isinstance(payload, dict) else payload
        elif extension == "csv":
            rows = list(csv.DictReader(io.StringIO(text)))
        else:
            raise ManualItemsError("Use a .csv or .json file.")
    except (json.JSONDecodeError, csv.Error) as error:
        raise ManualItemsError("The file is not valid CSV or JSON.") from error

    if not isinstance(rows, list) or not rows:
        raise ManualItemsError("The upload must contain a non-empty list of items.")

    parsed: List[Dict[str, Any]] = []
    for index, row in enumerate(rows, start=1):
        if not isinstance(row, dict) or not str(row.get("raw_item", "")).strip():
            raise ManualItemsError(f"Row {index} must contain a non-empty raw_item.")
        try:
            qty = float(row.get("qty", 1))
        except (TypeError, ValueError) as error:
            raise ManualItemsError(f"Row {index} has an invalid qty.") from error
        if not math.isfinite(qty) or qty <= 0:
            raise ManualItemsError(f"Row {index} qty must be greater than zero.")

        item: Dict[str, Any] = {
            "raw_item": str(row["raw_item"]).strip(),
            "qty": qty,
        }
        price = row.get("price_usd", row.get("price"))
        if price not in (None, ""):
            try:
                price_usd = float(price)
            except (TypeError, ValueError) as error:
                raise ManualItemsError(f"Row {index} has an invalid price_usd.") from error
            if not math.isfinite(price_usd) or price_usd < 0:
                raise ManualItemsError(f"Row {index} price_usd cannot be negative.")
            item["price_usd"] = price_usd
        parsed.append(item)

    return parsed
