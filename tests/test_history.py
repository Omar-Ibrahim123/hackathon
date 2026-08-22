import sqlite3
from datetime import datetime, timezone

import pytest

import history
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


def imported_trip(local_id="147ba6a4-eefd-4dce-99a1-17d31ff7291c"):
    return {
        **NEW_TRIP,
        "id": local_id,
        "savedAt": "2026-07-05T16:00:00+00:00",
    }


def test_import_is_idempotent_and_legacy_reference_survives_restart(tmp_path):
    database_path = str(tmp_path / "history.db")
    original = imported_trip()

    first = HistoryStore(database_path).import_trips([original])
    second = HistoryStore(database_path).import_trips([original])

    assert first == second
    assert first[0]["id"] == "trip_1"
    assert first[0]["savedAt"] == original["savedAt"]
    reopened = HistoryStore(database_path)
    assert reopened.get_trip(original["id"]) == first[0]
    assert reopened.delete_trip(original["id"]) is True
    assert reopened.get_trip("trip_1") is None


def test_import_rejects_changed_data_for_an_existing_local_id(tmp_path):
    store = HistoryStore(str(tmp_path / "history.db"))
    original = imported_trip()
    store.import_trips([original])

    with pytest.raises(history.HistoryConflictError):
        store.import_trips([{**original, "totalCo2eKg": 99.0}])

    assert store.get_trip(original["id"])["totalCo2eKg"] == 6.4


def test_import_rolls_back_the_whole_batch_on_conflict(tmp_path):
    store = HistoryStore(str(tmp_path / "history.db"))
    original = imported_trip()
    store.import_trips([original])
    new_trip = imported_trip("6002598f-31b6-4906-b002-12cd329b5102")

    with pytest.raises(history.HistoryConflictError):
        store.import_trips([new_trip, {**original, "source": "manual"}])

    assert store.get_trip(new_trip["id"]) is None
    assert store.list_trips() == [store.get_trip(original["id"])]
