import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


class HistoryStore:
    """Persists completed receipt analyses for later history and statistics."""

    def __init__(self, database_path: str | None = None):
        configured_path = database_path or os.getenv("HISTORY_DB_PATH", "data/history.db")
        self.database_path = Path(configured_path)
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        return connection

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS receipts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    created_at TEXT NOT NULL,
                    total_co2e_kg REAL NOT NULL,
                    total_items_processed INTEGER NOT NULL,
                    potential_total_savings_kg REAL NOT NULL
                );

                CREATE TABLE IF NOT EXISTS receipt_items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    receipt_id INTEGER NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
                    raw_item TEXT NOT NULL,
                    matched_item TEXT NOT NULL,
                    category TEXT NOT NULL,
                    qty REAL NOT NULL,
                    weight REAL,
                    weight_unit TEXT,
                    price REAL,
                    item_co2e_kg REAL NOT NULL,
                    confidence_score REAL NOT NULL,
                    status TEXT NOT NULL,
                    source TEXT
                );

                CREATE INDEX IF NOT EXISTS idx_receipts_created_at
                    ON receipts(created_at);
                CREATE INDEX IF NOT EXISTS idx_receipt_items_category
                    ON receipt_items(category);
                """
            )

    def save_receipt(self, result: dict[str, Any]) -> dict[str, Any]:
        summary = result["summary"]
        created_at = datetime.now(timezone.utc).isoformat()

        with self._connect() as connection:
            cursor = connection.execute(
                """
                INSERT INTO receipts (
                    created_at, total_co2e_kg, total_items_processed,
                    potential_total_savings_kg
                ) VALUES (?, ?, ?, ?)
                """,
                (
                    created_at,
                    summary["total_co2e_kg"],
                    summary["total_items_processed"],
                    summary["potential_total_savings_kg"],
                ),
            )
            receipt_id = cursor.lastrowid

            connection.executemany(
                """
                INSERT INTO receipt_items (
                    receipt_id, raw_item, matched_item, category, qty, weight,
                    weight_unit, price, item_co2e_kg, confidence_score, status, source
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        receipt_id,
                        item.get("raw_item", ""),
                        item.get("matched_item", "Unknown Item"),
                        item.get("category", "Uncategorized"),
                        item.get("qty", 1.0),
                        item.get("weight"),
                        item.get("weight_unit"),
                        item.get("price"),
                        item.get("item_co2e_kg", 0.0),
                        item.get("confidence_score", 0.0),
                        item.get("status", "UNMATCHED"),
                        item.get("source"),
                    )
                    for item in result["line_items"]
                ],
            )

        return {"id": receipt_id, "created_at": created_at, **summary}

    def list_receipts(self, limit: int = 50) -> list[dict[str, Any]]:
        with self._connect() as connection:
            receipts = connection.execute(
                """
                SELECT id, created_at, total_co2e_kg, total_items_processed,
                       potential_total_savings_kg
                FROM receipts
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()

            result = []
            for receipt in receipts:
                items = connection.execute(
                    """
                    SELECT raw_item, matched_item, category, qty, weight,
                           weight_unit, price, item_co2e_kg, confidence_score,
                           status, source
                    FROM receipt_items
                    WHERE receipt_id = ?
                    ORDER BY id
                    """,
                    (receipt["id"],),
                ).fetchall()
                result.append({**dict(receipt), "items": [dict(item) for item in items]})

        return result

    def stats(self) -> dict[str, Any]:
        with self._connect() as connection:
            totals = connection.execute(
                """
                SELECT COUNT(*) AS receipts, COALESCE(SUM(total_co2e_kg), 0) AS total_co2e_kg,
                       COALESCE(SUM(total_items_processed), 0) AS total_items_processed,
                       COALESCE(SUM(potential_total_savings_kg), 0) AS potential_total_savings_kg
                FROM receipts
                """
            ).fetchone()
            categories = connection.execute(
                """
                SELECT category, COUNT(*) AS item_count,
                       ROUND(SUM(item_co2e_kg), 2) AS total_co2e_kg
                FROM receipt_items
                GROUP BY category
                ORDER BY total_co2e_kg DESC
                """
            ).fetchall()

        return {
            "receipts": totals["receipts"],
            "total_co2e_kg": round(totals["total_co2e_kg"], 2),
            "total_items_processed": totals["total_items_processed"],
            "potential_total_savings_kg": round(totals["potential_total_savings_kg"], 2),
            "by_category": [dict(category) for category in categories],
        }
