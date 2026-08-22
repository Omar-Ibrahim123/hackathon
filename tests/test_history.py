import sqlite3
from datetime import datetime, timezone

from history import HistoryStore


NEW_TRIP = {
    "source": "receipt",
    "totalCo2eKg": 6.4,
    "items": [
        {"id": "item-0", "name": "Milk", "co2eKg": 1.2},
        {"id": "item-1", "name": "Beans", "co2eKg": 0.4},
    ],
}


def test_create_get_list_and_delete_trip(tmp_path):
    store = HistoryStore(
        str(tmp_path / "history.db"),
        now=lambda: datetime(2026, 8, 22, 14, 30, tzinfo=timezone.utc),
    )

    saved = store.create_trip(NEW_TRIP)

    assert saved == {
        **NEW_TRIP,
        "id": "trip_1",
        "savedAt": "2026-08-22T14:30:00+00:00",
    }
    assert store.get_trip("trip_1") == saved
    assert store.list_trips() == [saved]
    assert store.delete_trip("trip_1") is True
    assert store.get_trip("trip_1") is None
    assert store.delete_trip("trip_1") is False


def test_lists_newest_first_and_preserves_item_order(tmp_path):
    moments = iter(
        [
            datetime(2026, 8, 20, 9, 0, tzinfo=timezone.utc),
            datetime(2026, 8, 22, 9, 0, tzinfo=timezone.utc),
        ]
    )
    store = HistoryStore(str(tmp_path / "history.db"), now=lambda: next(moments))
    older = store.create_trip(NEW_TRIP)
    newer = store.create_trip(
        {
            "source": "manual",
            "totalCo2eKg": 2.5,
            "items": [
                {"id": "manual-1", "name": "Apples", "co2eKg": 0.2},
                {"id": "manual-2", "name": "Rice", "co2eKg": 2.3},
            ],
        }
    )

    assert [trip["id"] for trip in store.list_trips()] == ["trip_2", "trip_1"]
    assert store.get_trip(newer["id"])["items"] == [
        {"id": "manual-1", "name": "Apples", "co2eKg": 0.2},
        {"id": "manual-2", "name": "Rice", "co2eKg": 2.3},
    ]
    assert store.get_trip(older["id"])["savedAt"] == "2026-08-20T09:00:00+00:00"


def test_delete_cascades_to_trip_items(tmp_path):
    database_path = tmp_path / "history.db"
    store = HistoryStore(str(database_path))
    saved = store.create_trip(NEW_TRIP)

    assert store.delete_trip(saved["id"]) is True

    with sqlite3.connect(database_path) as connection:
        item_count = connection.execute("SELECT COUNT(*) FROM trip_items").fetchone()[0]
    assert item_count == 0
