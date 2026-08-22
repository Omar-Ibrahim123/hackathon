from datetime import datetime

from fastapi.testclient import TestClient
import pytest

import main
from history import HistoryStore


RECOMMENDATION = {
    "originalItem": "Ground Beef",
    "originalCo2eKg": 10.0,
    "recommendedSwap": "Lentils",
    "swapCo2eKg": 0.41,
    "potentialSavingsKg": 9.59,
}
NEW_TRIP = {
    "source": "receipt",
    "totalCo2eKg": 6.4,
    "items": [{"id": "item-0", "name": "Milk", "co2eKg": 1.2}],
    "ecoSwapRecommendations": [RECOMMENDATION],
}
LEGACY_ID = "147ba6a4-eefd-4dce-99a1-17d31ff7291c"
IMPORTED_TRIP = {
    **NEW_TRIP,
    "id": LEGACY_ID,
    "savedAt": "2026-07-05T16:00:00+00:00",
}
CALCULATION = {
    "summary": {
        "total_co2e_kg": 6.4,
        "total_items_processed": 1,
        "potential_total_savings_kg": 0.0,
    },
    "line_items": [
        {
            "raw_item": "Milk",
            "matched_item": "Milk",
            "item_co2e_kg": 6.4,
        }
    ],
}


class FakeEngine:
    def analyze_receipt(self, items):
        return CALCULATION

    def analyze_receipt_image(self, image_bytes, content_type):
        return CALCULATION


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(
        main,
        "history_store",
        HistoryStore(str(tmp_path / "history.db")),
        raising=False,
    )
    with TestClient(main.app) as test_client:
        yield test_client


def test_trip_crud_contract(client):
    response = client.post("/api/trips", json=NEW_TRIP)

    assert response.status_code == 201
    saved = response.json()
    assert saved["id"] == "trip_1"
    assert saved["source"] == "receipt"
    assert saved["items"] == NEW_TRIP["items"]
    assert client.get("/api/trips").json() == [saved]
    assert client.get(f"/api/trips/{saved['id']}").json() == saved
    assert client.delete(f"/api/trips/{saved['id']}").status_code == 204
    assert client.get(f"/api/trips/{saved['id']}").status_code == 404


def test_saved_trip_model_preserves_valid_recommendations():
    trip = main.NewTripModel.model_validate(NEW_TRIP)

    assert trip.model_dump(mode="json")["ecoSwapRecommendations"] == [
        RECOMMENDATION
    ]


def test_legacy_trip_defaults_recommendations_to_empty(client):
    legacy = {
        key: value
        for key, value in NEW_TRIP.items()
        if key != "ecoSwapRecommendations"
    }

    response = client.post("/api/trips", json=legacy)

    assert response.status_code == 201
    assert response.json()["ecoSwapRecommendations"] == []


@pytest.mark.parametrize(
    "recommendation",
    [
        {**RECOMMENDATION, "originalItem": ""},
        {**RECOMMENDATION, "originalCo2eKg": -1},
        {**RECOMMENDATION, "swapCo2eKg": -1},
        {**RECOMMENDATION, "potentialSavingsKg": 0},
        {**RECOMMENDATION, "swapCo2eKg": 11},
    ],
)
def test_save_rejects_invalid_recommendations(client, recommendation):
    response = client.post(
        "/api/trips",
        json={**NEW_TRIP, "ecoSwapRecommendations": [recommendation]},
    )

    assert response.status_code == 422


@pytest.mark.parametrize(
    "payload",
    [
        {**NEW_TRIP, "source": "other"},
        {**NEW_TRIP, "totalCo2eKg": -1},
        {**NEW_TRIP, "items": [{"id": "", "name": "Milk", "co2eKg": 1}]},
        {**NEW_TRIP, "items": [{"id": "item", "name": "", "co2eKg": 1}]},
        {**NEW_TRIP, "items": [{"id": "item", "name": "Milk", "co2eKg": -1}]},
        {
            **NEW_TRIP,
            "items": [
                {"id": "duplicate", "name": "Milk", "co2eKg": 1},
                {"id": "duplicate", "name": "Beans", "co2eKg": 1},
            ],
        },
    ],
)
def test_save_rejects_invalid_trip_payloads(client, payload):
    assert client.post("/api/trips", json=payload).status_code == 422
    assert client.get("/api/trips").json() == []


def test_missing_trip_lookup_and_delete_return_404(client):
    assert client.get("/api/trips/missing").status_code == 404
    assert client.delete("/api/trips/missing").status_code == 404


def test_import_preserves_timestamp_and_supports_legacy_lookup_and_delete(client):
    response = client.post("/api/trips/import", json={"trips": [IMPORTED_TRIP]})

    assert response.status_code == 200
    canonical = response.json()[0]
    assert canonical["id"] == "trip_1"
    assert datetime.fromisoformat(canonical["savedAt"].replace("Z", "+00:00")) == (
        datetime.fromisoformat(IMPORTED_TRIP["savedAt"])
    )
    assert client.get(f"/api/trips/{LEGACY_ID}").json() == canonical
    assert client.delete(f"/api/trips/{LEGACY_ID}").status_code == 204
    assert client.get("/api/trips/trip_1").status_code == 404


def test_import_conflict_returns_409_without_changing_history(client):
    assert client.post(
        "/api/trips/import",
        json={"trips": [IMPORTED_TRIP]},
    ).status_code == 200

    response = client.post(
        "/api/trips/import",
        json={"trips": [{**IMPORTED_TRIP, "totalCo2eKg": 99}]},
    )

    assert response.status_code == 409
    assert client.get("/api/trips").json()[0]["totalCo2eKg"] == 6.4


def test_calculation_endpoints_do_not_write_history(client, monkeypatch):
    monkeypatch.setattr(main, "engine", FakeEngine())

    manual = client.post(
        "/api/receipts/analyze",
        json={"items": [{"raw_item": "Milk", "qty": 1}]},
    )
    assert manual.status_code == 200
    assert client.get("/api/trips").json() == []

    receipt = client.post(
        "/api/receipts/scan",
        files={"file": ("receipt.jpg", b"receipt", "image/jpeg")},
    )
    assert receipt.status_code == 200
    assert client.get("/api/trips").json() == []
