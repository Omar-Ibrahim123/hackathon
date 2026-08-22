from __future__ import annotations

import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable


_CANONICAL_ID = re.compile(r"trip_(\d+)")


class HistoryConflictError(RuntimeError):
    """Raised when one browser import key describes different trip data."""


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

    @classmethod
    def _parse_timestamp(cls, value: str) -> str:
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except (TypeError, ValueError) as error:
            raise ValueError("Trip timestamps must be valid ISO 8601 values.") from error
        return cls._normalize_timestamp(parsed)

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

    def _find_trip_row(
        self,
        connection: sqlite3.Connection,
        reference: str,
    ) -> sqlite3.Row | None:
        trip_id = self._canonical_row_id(reference)
        if trip_id is not None:
            row = connection.execute(
                "SELECT * FROM trips WHERE id = ?",
                (trip_id,),
            ).fetchone()
            if row is not None:
                return row
        return connection.execute(
            "SELECT * FROM trips WHERE import_key = ?",
            (reference,),
        ).fetchone()

    @staticmethod
    def _matches_import(saved: dict, imported: dict, saved_at: str) -> bool:
        return {
            "source": saved["source"],
            "savedAt": saved["savedAt"],
            "totalCo2eKg": saved["totalCo2eKg"],
            "items": saved["items"],
        } == {
            "source": imported["source"],
            "savedAt": saved_at,
            "totalCo2eKg": imported["totalCo2eKg"],
            "items": imported["items"],
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

    def import_trips(self, trips: list[dict]) -> list[dict]:
        imported_trips = []
        with self._connect() as connection:
            for trip in trips:
                import_key = trip["id"]
                saved_at = self._parse_timestamp(trip["savedAt"])
                existing_row = connection.execute(
                    "SELECT * FROM trips WHERE import_key = ?",
                    (import_key,),
                ).fetchone()
                if existing_row is not None:
                    existing = self._hydrate_trip(connection, existing_row)
                    if not self._matches_import(existing, trip, saved_at):
                        raise HistoryConflictError(
                            f'Imported trip "{import_key}" conflicts with saved history.'
                        )
                    imported_trips.append(existing)
                    continue

                trip_id = self._insert_trip(
                    connection,
                    trip,
                    saved_at,
                    import_key=import_key,
                )
                row = connection.execute(
                    "SELECT * FROM trips WHERE id = ?",
                    (trip_id,),
                ).fetchone()
                imported_trips.append(self._hydrate_trip(connection, row))
        return imported_trips

    def get_trip(self, reference: str) -> dict | None:
        with self._connect() as connection:
            row = self._find_trip_row(connection, reference)
            return self._hydrate_trip(connection, row) if row else None

    def delete_trip(self, reference: str) -> bool:
        with self._connect() as connection:
            row = self._find_trip_row(connection, reference)
            if row is None:
                return False
            cursor = connection.execute("DELETE FROM trips WHERE id = ?", (row["id"],))
            return cursor.rowcount > 0
