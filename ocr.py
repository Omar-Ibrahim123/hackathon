import base64
import json
import os

import anthropic

MODEL = "claude-haiku-4-5"

RECEIPT_ITEMS_SCHEMA = {
    "type": "object",
    "properties": {
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "raw_item": {"type": "string"},
                    "qty": {"type": "number"},
                },
                "required": ["raw_item", "qty"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["items"],
    "additionalProperties": False,
}

_MIME_BY_CONTENT_TYPE = {
    "image/jpeg": "image/jpeg",
    "image/jpg": "image/jpeg",
    "image/png": "image/png",
    "image/webp": "image/webp",
}


class OcrUnavailableError(RuntimeError):
    """Raised when receipt OCR can't run because no vision backend is configured."""


class OcrFailedError(RuntimeError):
    """Raised when the vision backend was called but couldn't read the receipt."""


def extract_items_from_receipt(image_bytes: bytes, content_type: str = "image/jpeg") -> list:
    """Turns a photographed receipt into structured line items using Claude's
    vision model, since receipts vary too much in layout/font for a fixed
    regex parser over plain OCR text to hold up.

    Returns a list of {"raw_item": str, "qty": float} dicts, ready to feed
    into CarbonEngine.analyze_receipt.
    """
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise OcrUnavailableError(
            "Receipt scanning requires ANTHROPIC_API_KEY to be set."
        )

    mime_type = _MIME_BY_CONTENT_TYPE.get(content_type, "image/jpeg")
    client = anthropic.Anthropic(api_key=api_key)

    prompt = (
        "This image is a grocery/retail receipt. Extract every purchased "
        "line item (ignore subtotals, tax, totals, coupons, and payment "
        "info). For each item, return the raw item text as printed and the "
        "purchased quantity (default to 1 if not shown)."
    )

    try:
        response = client.messages.create(
            model=MODEL,
            max_tokens=4096,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": mime_type,
                                "data": base64.standard_b64encode(image_bytes).decode("utf-8"),
                            },
                        },
                        {"type": "text", "text": prompt},
                    ],
                }
            ],
            output_config={
                "format": {"type": "json_schema", "schema": RECEIPT_ITEMS_SCHEMA}
            },
        )

        text = next(block.text for block in response.content if block.type == "text")
        items = json.loads(text)["items"]
        return [
            {"raw_item": item["raw_item"], "qty": float(item.get("qty", 1.0))}
            for item in items
            if item.get("raw_item")
        ]

    except (OcrUnavailableError, OcrFailedError):
        raise
    except Exception as e:
        raise OcrFailedError(f"Could not read receipt: {e}") from e
