from __future__ import annotations

import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable


_CANONICAL_ID = re.compile(r"trip_(\d+)")


class HistoryStore:
    """Stores normalized GreenerCart trips in SQLite."""

    def __init__(
        self,
        database_path: str = "data/history.db",
        now: Callable[[], datetime] | None = None,
    ):
        self.database_path = Path(database_path)
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self._now = now or (lambda: datetime.now(timezone.utc))
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS trips (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    import_key TEXT UNIQUE,
                    source TEXT NOT NULL CHECK (source IN ('receipt', 'manual')),
                    saved_at TEXT NOT NULL,
                    total_co2e_kg REAL NOT NULL CHECK (total_co2e_kg >= 0)
                );

                CREATE TABLE IF NOT EXISTS trip_items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
                    item_id TEXT NOT NULL,
                    position INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    item_co2e_kg REAL NOT NULL CHECK (item_co2e_kg >= 0),
                    UNIQUE (trip_id, item_id),
                    UNIQUE (trip_id, position)
                );

                CREATE INDEX IF NOT EXISTS idx_trips_saved_at
                    ON trips(saved_at DESC, id DESC);
                CREATE INDEX IF NOT EXISTS idx_trip_items_trip_id
                    ON trip_items(trip_id);
                """
            )

    @staticmethod
    def _canonical_row_id(reference: str) -> int | None:
        match = _CANONICAL_ID.fullmatch(reference)
        return int(match.group(1)) if match else None

    @staticmethod
    def _normalize_timestamp(value: datetime) -> str:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("Trip timestamps must include a timezone.")
        return value.astimezone(timezone.utc).isoformat()

    def _insert_trip(
        self,
        connection: sqlite3.Connection,
        trip: dict,
        saved_at: str,
        import_key: str | None = None,
    ) -> int:
        cursor = connection.execute(
            """
            INSERT INTO trips (import_key, source, saved_at, total_co2e_kg)
            VALUES (?, ?, ?, ?)
            """,
            (import_key, trip["source"], saved_at, trip["totalCo2eKg"]),
        )
        trip_id = int(cursor.lastrowid)
        connection.executemany(
            """
            INSERT INTO trip_items (
                trip_id, item_id, position, name, item_co2e_kg
            ) VALUES (?, ?, ?, ?, ?)
            """,
            [
                (
                    trip_id,
                    item["id"],
                    position,
                    item["name"],
                    item["co2eKg"],
                )
                for position, item in enumerate(trip["items"])
            ],
        )
        return trip_id

    def _hydrate_trip(
        self,
        connection: sqlite3.Connection,
        row: sqlite3.Row,
    ) -> dict:
        items = connection.execute(
            """
            SELECT item_id, name, item_co2e_kg
            FROM trip_items
            WHERE trip_id = ?
            ORDER BY position
            """,
            (row["id"],),
        ).fetchall()
        return {
            "id": f"trip_{row['id']}",
            "source": row["source"],
            "savedAt": row["saved_at"],
            "totalCo2eKg": row["total_co2e_kg"],
            "items": [
                {
                    "id": item["item_id"],
                    "name": item["name"],
                    "co2eKg": item["item_co2e_kg"],
                }
                for item in items
            ],
        }

    def create_trip(self, trip: dict) -> dict:
        saved_at = self._normalize_timestamp(self._now())
        with self._connect() as connection:
            trip_id = self._insert_trip(connection, trip, saved_at)
            row = connection.execute(
                "SELECT * FROM trips WHERE id = ?",
                (trip_id,),
            ).fetchone()
            return self._hydrate_trip(connection, row)

    def list_trips(self) -> list[dict]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT * FROM trips ORDER BY saved_at DESC, id DESC"
            ).fetchall()
            return [self._hydrate_trip(connection, row) for row in rows]

    def get_trip(self, reference: str) -> dict | None:
        trip_id = self._canonical_row_id(reference)
        if trip_id is None:
            return None
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM trips WHERE id = ?",
                (trip_id,),
            ).fetchone()
            return self._hydrate_trip(connection, row) if row else None

    def delete_trip(self, reference: str) -> bool:
        trip_id = self._canonical_row_id(reference)
        if trip_id is None:
            return False
        with self._connect() as connection:
            cursor = connection.execute("DELETE FROM trips WHERE id = ?", (trip_id,))
            return cursor.rowcount > 0
