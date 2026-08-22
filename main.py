from dotenv import load_dotenv

load_dotenv()  # must run before CarbonEngine() reads CLIMATIQ_API_KEY / ANTHROPIC_API_KEY

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from engine import CarbonEngine, OcrFailedError, OcrUnavailableError

app = FastAPI(
    title="EcoReceipt API",
    description="Scans grocery receipts and estimates the carbon footprint of each purchase.",
    version="1.0.0",
)

# The mobile/web client is a separate origin from this API, so allow all
# origins for this hackathon build rather than hardcoding a deploy URL.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

engine = CarbonEngine()

_ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp"}
_MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10 MB


class ReceiptItem(BaseModel):
    raw_item: str = Field(..., min_length=1, description="Item text as printed on the receipt")
    qty: float = Field(1.0, gt=0, description="Quantity purchased")
    weight: float | None = Field(None, gt=0, description="Weight printed for this item, if sold by weight")
    weight_unit: str | None = Field(None, description="Unit the weight is printed in, e.g. 'lb', 'kg', 'oz', 'g'")
    price: float | None = Field(None, gt=0, description="Total price printed for this line item, in USD")


class AnalyzeRequest(BaseModel):
    items: list[ReceiptItem]


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/api/receipts/analyze")
def analyze_receipt(request: AnalyzeRequest) -> dict:
    """Calculates carbon footprint for already-parsed receipt line items.
    Use this when the client already has OCR/parsed items (e.g. from a
    separate scanning step or for testing) and wants to skip image upload.
    """
    if not request.items:
        raise HTTPException(status_code=400, detail="No items provided.")

    parsed_items = [item.model_dump() for item in request.items]
    return engine.analyze_receipt(parsed_items)


@app.post("/api/receipts/scan")
async def scan_receipt(file: UploadFile = File(...)) -> dict:
    """Accepts a photographed receipt, runs OCR, and returns the full
    carbon footprint breakdown in one call."""
    if file.content_type not in _ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported image type '{file.content_type}'. Use JPEG, PNG, or WebP.",
        )

    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(image_bytes) > _MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="Image exceeds 10 MB limit.")

    try:
        return engine.analyze_receipt_image(image_bytes, content_type=file.content_type)
    except OcrUnavailableError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except OcrFailedError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
