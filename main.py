import os
from datetime import datetime
from typing import Literal

from dotenv import load_dotenv

load_dotenv()  # must run before CarbonEngine() reads CLIMATIQ_API_KEY / GEMINI_API_KEY

from fastapi import Depends, FastAPI, File, HTTPException, Response, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from engine import CarbonEngine, OcrFailedError, OcrUnavailableError
from history import HistoryConflictError, HistoryStore

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
history_store = HistoryStore(os.getenv("HISTORY_DB_PATH", "data/history.db"))

_ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/webp"}
_MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10 MB


class ReceiptItem(BaseModel):
    raw_item: str = Field(..., min_length=1, description="Item text as printed on the receipt")
    qty: float = Field(1.0, gt=0, description="Quantity purchased")


class AnalyzeRequest(BaseModel):
    items: list[ReceiptItem]


class TripItemModel(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    co2eKg: float = Field(ge=0, allow_inf_nan=False)


class NewTripModel(BaseModel):
    source: Literal["receipt", "manual"]
    totalCo2eKg: float = Field(ge=0, allow_inf_nan=False)
    items: list[TripItemModel]

    @model_validator(mode="after")
    def item_ids_are_unique(self):
        item_ids = [item.id for item in self.items]
        if len(item_ids) != len(set(item_ids)):
            raise ValueError("Trip item IDs must be unique.")
        return self


class SavedTripModel(NewTripModel):
    id: str = Field(min_length=1)
    savedAt: datetime

    @field_validator("savedAt")
    @classmethod
    def timestamp_has_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("Trip timestamps must include a timezone.")
        return value


class ImportTripsRequest(BaseModel):
    trips: list[SavedTripModel]


def get_history_store() -> HistoryStore:
    return history_store


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/trips", response_model=list[SavedTripModel])
def list_trips(store: HistoryStore = Depends(get_history_store)) -> list[dict]:
    return store.list_trips()


@app.post(
    "/api/trips",
    response_model=SavedTripModel,
    status_code=status.HTTP_201_CREATED,
)
def save_trip(
    trip: NewTripModel,
    store: HistoryStore = Depends(get_history_store),
) -> dict:
    return store.create_trip(trip.model_dump(mode="json"))


@app.post("/api/trips/import", response_model=list[SavedTripModel])
def import_trips(
    request: ImportTripsRequest,
    store: HistoryStore = Depends(get_history_store),
) -> list[dict]:
    try:
        return store.import_trips(
            [trip.model_dump(mode="json") for trip in request.trips]
        )
    except HistoryConflictError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@app.get("/api/trips/{trip_id}", response_model=SavedTripModel)
def get_trip(
    trip_id: str,
    store: HistoryStore = Depends(get_history_store),
) -> dict:
    trip = store.get_trip(trip_id)
    if trip is None:
        raise HTTPException(status_code=404, detail="Trip not found.")
    return trip


@app.delete("/api/trips/{trip_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_trip(
    trip_id: str,
    store: HistoryStore = Depends(get_history_store),
) -> Response:
    if not store.delete_trip(trip_id):
        raise HTTPException(status_code=404, detail="Trip not found.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


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
