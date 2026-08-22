import importlib
import json
import os

try:
    genai = importlib.import_module("google.genai")
    types = genai.types
except ImportError:
    genai = None
    types = None

RECEIPT_ITEMS_SCHEMA = {
    "type": "ARRAY",
    "items": {
        "type": "OBJECT",
        "properties": {
            "raw_item": {"type": "STRING"},
            "qty": {"type": "NUMBER"},
        },
        "required": ["raw_item", "qty"],
    },
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
    """Turns a photographed receipt into structured line items using Gemini's
    vision model, since receipts vary too much in layout/font for a fixed
    regex parser over plain OCR text to hold up.

    Returns a list of {"raw_item": str, "qty": float} dicts, ready to feed
    into CarbonEngine.analyze_receipt.
    """
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key or genai is None or types is None:
        raise OcrUnavailableError(
            "Receipt scanning requires GEMINI_API_KEY to be set."
        )

    mime_type = _MIME_BY_CONTENT_TYPE.get(content_type, "image/jpeg")
    client = genai.Client(api_key=api_key)

    prompt = (
        "This image is a grocery/retail receipt. Extract every purchased "
        "line item (ignore subtotals, tax, totals, coupons, and payment "
        "info). For each item, return the raw item text as printed and the "
        "purchased quantity (default to 1 if not shown)."
    )

    try:
        response = client.models.generate_content(
            model="gemini-3.6-flash",
            contents=[
                types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                prompt,
            ],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=RECEIPT_ITEMS_SCHEMA,
            ),
        )

        items = json.loads(response.text)
        return [
            {"raw_item": item["raw_item"], "qty": float(item.get("qty", 1.0))}
            for item in items
            if item.get("raw_item")
        ]

    except (OcrUnavailableError, OcrFailedError):
        raise
    except Exception as e:
        raise OcrFailedError(f"Could not read receipt: {e}") from e
