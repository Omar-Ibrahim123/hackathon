# Eco-Swap Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recalculate trustworthy eco-swap recommendations after final emissions resolution and preserve them through the saved-trip API and SQLite history.

**Architecture:** Keep the existing receipt endpoints and response format. Extract deterministic recommendation construction into `calculator.py`, invoke it again from `CarbonEngine` after all line items have been resolved, and persist the resulting trip-level recommendation list in a normalized SQLite child table. Legacy trip payloads and existing databases receive an empty recommendation list without destructive migration.

**Tech Stack:** Python 3.9+, FastAPI, Pydantic v2, SQLite, pandas, pytest, FastAPI TestClient

**Spec:** `docs/superpowers/specs/2026-08-22-eco-swap-backend-design.md`

## Global Constraints

- Preserve the existing `/api/receipts/analyze`, `/api/receipts/scan`, and `/api/trips` routes.
- The calculation response remains snake_case; saved-trip payloads remain camelCase.
- Replacements use the configured local dataset estimate; final original emissions use the resolved line-item value.
- Return only positive savings, ordered from greatest to least, with a summary equal to their rounded sum.
- Missing saved-trip recommendations normalize to `[]`.
- Do not add frontend or Streamlit changes in this plan.
- Do not modify or commit `.env.save`.

---

### Task 1: Restore the backend test baseline and finalize recommendations after provider resolution

**Files:**
- Create: `tests/test_calculator.py`
- Create: `tests/test_engine.py`
- Modify: `main.py:1`
- Modify: `calculator.py:9-102`
- Modify: `engine.py:3-60`

**Interfaces:**
- Consumes: `ReceiptMatcher.match_item(raw_item: str) -> dict`, the emission-factor DataFrame, and resolved line-item dictionaries.
- Produces: `build_eco_swap_recommendations(line_items: list, dataset_df: pd.DataFrame, matcher: ReceiptMatcher) -> list[dict]`; `CarbonEngine.analyze_receipt(parsed_items: list) -> dict` whose recommendations and summary reflect final line-item emissions.

- [ ] **Step 1: Make `main.py` importable on the repository's Python 3.9 runtime**

Add postponed annotation evaluation before all other imports:

```python
from __future__ import annotations
```

- [ ] **Step 2: Run the existing backend suite to establish the restored baseline**

Run: `.venv/bin/python -m pytest tests -q`

Expected: all existing tests pass instead of failing during `main.py` collection with `unsupported operand type(s) for |`.

- [ ] **Step 3: Write failing unit tests for deterministic recommendation construction**

Create `tests/test_calculator.py` with a real matcher and dataset fixture and assertions covering ordering, final-original emissions, and non-beneficial removal:

```python
from pathlib import Path

import pandas as pd

from calculator import build_eco_swap_recommendations
from matcher import ReceiptMatcher


DATASET = Path(__file__).parents[1] / "emission_factors.csv"


def test_builds_sorted_swaps_from_final_line_item_emissions():
    dataset = pd.read_csv(DATASET)
    matcher = ReceiptMatcher(str(DATASET))
    line_items = [
        {"raw_item": "BNDL GROUND BEEF 1LB", "matched_item": "Ground Beef", "qty": 2.0, "item_co2e_kg": 30.0},
        {"raw_item": "CHEDDAR CHEESE", "matched_item": "Cheddar Cheese", "qty": 1.0, "item_co2e_kg": 5.0},
    ]

    recommendations = build_eco_swap_recommendations(line_items, dataset, matcher)

    assert recommendations == sorted(
        recommendations,
        key=lambda recommendation: recommendation["potential_savings_kg"],
        reverse=True,
    )
    assert recommendations[0]["original_co2e_kg"] == 30.0
    assert recommendations[0]["potential_savings_kg"] == round(
        30.0 - recommendations[0]["swap_co2e_kg"], 2
    )


def test_omits_swap_when_final_original_is_not_higher_than_replacement():
    dataset = pd.read_csv(DATASET)
    matcher = ReceiptMatcher(str(DATASET))
    line_items = [
        {"raw_item": "BNDL GROUND BEEF 1LB", "matched_item": "Ground Beef", "qty": 1.0, "item_co2e_kg": 0.1},
    ]

    assert build_eco_swap_recommendations(line_items, dataset, matcher) == []
```

- [ ] **Step 4: Run the calculator tests to verify they fail for the missing helper**

Run: `.venv/bin/python -m pytest tests/test_calculator.py -v`

Expected: collection fails because `build_eco_swap_recommendations` does not exist.

- [ ] **Step 5: Extract recommendation construction in `calculator.py`**

Implement the public helper and replace the inline swap loop with a call to it:

```python
def build_eco_swap_recommendations(
    line_items: list,
    dataset_df: pd.DataFrame,
    matcher: ReceiptMatcher,
) -> list[dict]:
    id_map = dataset_df.set_index("id").to_dict(orient="index")
    recommendations = []

    for line_item in line_items:
        match = matcher.match_item(line_item["raw_item"])
        swap_id = match.get("eco_swap_id")
        if match["status"] == "UNMATCHED" or not swap_id or swap_id not in id_map:
            continue

        swap = id_map[swap_id]
        quantity = float(line_item.get("qty", 1.0))
        original_co2e = round(float(line_item["item_co2e_kg"]), 2)
        swap_co2e = round(
            float(swap["co2e_per_kg"])
            * float(swap["default_unit_weight_kg"])
            * quantity,
            2,
        )
        savings = round(original_co2e - swap_co2e, 2)
        if savings <= 0:
            continue

        recommendations.append(
            {
                "original_item": line_item["matched_item"],
                "original_co2e_kg": original_co2e,
                "recommended_swap": swap["item_name"],
                "swap_co2e_kg": swap_co2e,
                "potential_savings_kg": savings,
            }
        )

    return sorted(
        recommendations,
        key=lambda recommendation: recommendation["potential_savings_kg"],
        reverse=True,
    )
```

At the end of `process_receipt_items`, call the helper with the locally calculated `line_items` and derive `potential_total_savings_kg` from the returned list. Remove the duplicated inline recommendation-building loop and unused accumulator.

- [ ] **Step 6: Run calculator tests and existing matching tests**

Run: `.venv/bin/python -m pytest tests/test_calculator.py -v`

Expected: PASS.

- [ ] **Step 7: Write a failing engine test for a provider override**

Create `tests/test_engine.py`. Construct `CarbonEngine` with its real local matcher, replace `engine.climatiq` with a deterministic fake, and verify that the final recommendation uses the overridden original value:

```python
from engine import CarbonEngine


class FakeClimatiq:
    def fetch_item_footprint(self, *args, **kwargs):
        return {
            "status": "SUCCESS",
            "matched_item": "Climatiq Ground Beef",
            "category": "Food",
            "co2e_per_kg": 10.0,
        }


def test_rebuilds_swaps_after_climatiq_changes_original_emissions():
    engine = CarbonEngine()
    engine.climatiq = FakeClimatiq()

    result = engine.analyze_receipt(
        [{"raw_item": "BNDL GROUND BEEF 1LB", "qty": 1}]
    )

    recommendation = result["eco_swap_recommendations"][0]
    assert result["line_items"][0]["item_co2e_kg"] == 10.0
    assert recommendation["original_co2e_kg"] == 10.0
    assert recommendation["potential_savings_kg"] == round(
        10.0 - recommendation["swap_co2e_kg"], 2
    )
    assert result["summary"]["potential_total_savings_kg"] == recommendation[
        "potential_savings_kg"
    ]
```

- [ ] **Step 8: Run the engine test to verify the stale local value fails**

Run: `.venv/bin/python -m pytest tests/test_engine.py -v`

Expected: FAIL because the recommendation still contains the pre-Climatiq local original and savings.

- [ ] **Step 9: Rebuild recommendations in `CarbonEngine.analyze_receipt`**

Import the helper and invoke it after the `_resolve_line_item` loop:

```python
from calculator import build_eco_swap_recommendations, process_receipt_items


recommendations = build_eco_swap_recommendations(
    result["line_items"], self.dataset_df, self.matcher
)
result["eco_swap_recommendations"] = recommendations
result["summary"]["potential_total_savings_kg"] = round(
    sum(item["potential_savings_kg"] for item in recommendations), 2
)
```

Keep the existing final receipt-total recalculation immediately before this recommendation refresh.

- [ ] **Step 10: Run all backend tests**

Run: `.venv/bin/python -m pytest tests -q`

Expected: all tests pass.

- [ ] **Step 11: Commit calculation correctness**

```bash
git add main.py calculator.py engine.py tests/test_calculator.py tests/test_engine.py
git commit -m "fix: recalculate eco swaps after item resolution"
```

---

### Task 2: Define and validate the saved-trip recommendation API contract

**Files:**
- Modify: `main.py:50-84`
- Modify: `tests/test_trip_api.py:10-95`

**Interfaces:**
- Consumes: calculation recommendation values after the frontend converts their keys to camelCase.
- Produces: `EcoSwapRecommendationModel`; `NewTripModel.ecoSwapRecommendations: list[EcoSwapRecommendationModel]`; legacy payload normalization to `[]`.

- [ ] **Step 1: Extend the API fixture and write failing contract tests**

Add recommendations to `NEW_TRIP`:

```python
RECOMMENDATION = {
    "originalItem": "Ground Beef",
    "originalCo2eKg": 10.0,
    "recommendedSwap": "Lentils",
    "swapCo2eKg": 0.41,
    "potentialSavingsKg": 9.59,
}

NEW_TRIP = {
    "source": "receipt",
    "totalCo2eKg": 10.0,
    "items": [{"id": "item-0", "name": "Ground Beef", "co2eKg": 10.0}],
    "ecoSwapRecommendations": [RECOMMENDATION],
}
```

Add these tests:

```python
def test_legacy_trip_defaults_recommendations_to_empty(client):
    legacy = {key: value for key, value in NEW_TRIP.items() if key != "ecoSwapRecommendations"}
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
```

- [ ] **Step 2: Run the focused API tests to verify failure**

Run: `.venv/bin/python -m pytest tests/test_trip_api.py -v`

Expected: recommendation data is discarded or invalid recommendations are accepted.

- [ ] **Step 3: Add the Pydantic recommendation model**

Add before `NewTripModel`:

```python
class EcoSwapRecommendationModel(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    originalItem: str = Field(min_length=1)
    originalCo2eKg: float = Field(ge=0, allow_inf_nan=False)
    recommendedSwap: str = Field(min_length=1)
    swapCo2eKg: float = Field(ge=0, allow_inf_nan=False)
    potentialSavingsKg: float = Field(gt=0, allow_inf_nan=False)

    @model_validator(mode="after")
    def replacement_reduces_emissions(self):
        if self.swapCo2eKg >= self.originalCo2eKg:
            raise ValueError("Eco-swap replacements must reduce emissions.")
        return self
```

Add the defaulted field to `NewTripModel`:

```python
ecoSwapRecommendations: list[EcoSwapRecommendationModel] = Field(default_factory=list)
```

- [ ] **Step 4: Run the focused API tests**

Run: `.venv/bin/python -m pytest tests/test_trip_api.py -v`

Expected: the new validation tests pass; CRUD persistence still fails until Task 3 because `HistoryStore` does not yet write recommendations.

- [ ] **Step 5: Commit the API contract separately**

```bash
git add main.py tests/test_trip_api.py
git commit -m "feat: validate saved eco swap recommendations"
```

---

### Task 3: Persist ordered recommendations in SQLite history

**Files:**
- Modify: `history.py:35-176`
- Modify: `tests/test_history.py:8-145`
- Modify: `tests/test_trip_api.py:43-67`

**Interfaces:**
- Consumes: normalized trip dictionaries containing `ecoSwapRecommendations`.
- Produces: `HistoryStore.create_trip`, `list_trips`, `get_trip`, and `import_trips` results that round-trip ordered recommendation arrays; existing trips return `[]`.

- [ ] **Step 1: Extend history fixtures and write failing round-trip tests**

Add the recommendation fixture to `tests/test_history.py` and include it in `NEW_TRIP`:

```python
RECOMMENDATION = {
    "originalItem": "Ground Beef",
    "originalCo2eKg": 10.0,
    "recommendedSwap": "Lentils",
    "swapCo2eKg": 0.41,
    "potentialSavingsKg": 9.59,
}
```

Add tests for order, restart persistence, legacy databases, and cascade deletion:

```python
def test_preserves_recommendation_order_across_restart(tmp_path):
    database_path = str(tmp_path / "history.db")
    trip = {
        **NEW_TRIP,
        "ecoSwapRecommendations": [
            RECOMMENDATION,
            {
                "originalItem": "Cheese",
                "originalCo2eKg": 4.0,
                "recommendedSwap": "Plant Cheese",
                "swapCo2eKg": 1.0,
                "potentialSavingsKg": 3.0,
            },
        ],
    }

    saved = HistoryStore(database_path).create_trip(trip)
    reopened = HistoryStore(database_path).get_trip(saved["id"])
    assert reopened["ecoSwapRecommendations"] == trip["ecoSwapRecommendations"]


def test_existing_database_trips_hydrate_with_empty_recommendations(tmp_path):
    database_path = tmp_path / "history.db"
    with sqlite3.connect(database_path) as connection:
        connection.executescript(
            """
            CREATE TABLE trips (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                import_key TEXT UNIQUE,
                source TEXT NOT NULL,
                saved_at TEXT NOT NULL,
                total_co2e_kg REAL NOT NULL
            );
            CREATE TABLE trip_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                trip_id INTEGER NOT NULL,
                item_id TEXT NOT NULL,
                position INTEGER NOT NULL,
                name TEXT NOT NULL,
                item_co2e_kg REAL NOT NULL
            );
            INSERT INTO trips (source, saved_at, total_co2e_kg)
            VALUES ('receipt', '2026-08-22T14:30:00+00:00', 1.0);
            """
        )

    trip = HistoryStore(str(database_path)).get_trip("trip_1")
    assert trip["ecoSwapRecommendations"] == []
```

Extend the delete-cascade assertion:

```python
recommendation_count = connection.execute(
    "SELECT COUNT(*) FROM trip_recommendations"
).fetchone()[0]
assert recommendation_count == 0
```

- [ ] **Step 2: Run history tests to verify the recommendations are not persisted**

Run: `.venv/bin/python -m pytest tests/test_history.py -v`

Expected: recommendation round-trip and table assertions fail.

- [ ] **Step 3: Create the child table and index during initialization**

Add to the existing initialization script after `trip_items`:

```sql
CREATE TABLE IF NOT EXISTS trip_recommendations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    original_item TEXT NOT NULL,
    original_co2e_kg REAL NOT NULL CHECK (original_co2e_kg >= 0),
    recommended_swap TEXT NOT NULL,
    swap_co2e_kg REAL NOT NULL CHECK (swap_co2e_kg >= 0),
    potential_savings_kg REAL NOT NULL CHECK (potential_savings_kg > 0),
    UNIQUE (trip_id, position)
);

CREATE INDEX IF NOT EXISTS idx_trip_recommendations_trip_id
    ON trip_recommendations(trip_id);
```

- [ ] **Step 4: Insert recommendations in the same transaction as the trip**

After inserting `trip_items`, insert the defaulted list:

```python
connection.executemany(
    """
    INSERT INTO trip_recommendations (
        trip_id, position, original_item, original_co2e_kg,
        recommended_swap, swap_co2e_kg, potential_savings_kg
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    """,
    [
        (
            trip_id,
            position,
            recommendation["originalItem"],
            recommendation["originalCo2eKg"],
            recommendation["recommendedSwap"],
            recommendation["swapCo2eKg"],
            recommendation["potentialSavingsKg"],
        )
        for position, recommendation in enumerate(
            trip.get("ecoSwapRecommendations", [])
        )
    ],
)
```

- [ ] **Step 5: Hydrate ordered recommendations**

Query by trip ID ordered by `position`, then include this list in the returned trip:

```python
recommendations = connection.execute(
    """
    SELECT original_item, original_co2e_kg, recommended_swap,
           swap_co2e_kg, potential_savings_kg
    FROM trip_recommendations
    WHERE trip_id = ?
    ORDER BY position
    """,
    (row["id"],),
).fetchall()
```

Map each row to:

```python
{
    "originalItem": recommendation["original_item"],
    "originalCo2eKg": recommendation["original_co2e_kg"],
    "recommendedSwap": recommendation["recommended_swap"],
    "swapCo2eKg": recommendation["swap_co2e_kg"],
    "potentialSavingsKg": recommendation["potential_savings_kg"],
}
```

- [ ] **Step 6: Include recommendations in import conflict comparisons**

Add the defaulted field to both dictionaries in `_matches_import`:

```python
"ecoSwapRecommendations": saved.get("ecoSwapRecommendations", []),
```

and:

```python
"ecoSwapRecommendations": imported.get("ecoSwapRecommendations", []),
```

- [ ] **Step 7: Run history and API tests**

Run: `.venv/bin/python -m pytest tests/test_history.py tests/test_trip_api.py -v`

Expected: PASS, including recommendation round trips and legacy empty defaults.

- [ ] **Step 8: Commit persistence**

```bash
git add history.py tests/test_history.py tests/test_trip_api.py
git commit -m "feat: persist eco swaps in trip history"
```

---

### Task 4: Complete backend regression verification and contract documentation

**Files:**
- Modify: `README.md:47-78`

**Interfaces:**
- Consumes: the finalized calculation and saved-trip contracts from Tasks 1-3.
- Produces: documented API behavior and a verified backend ready for the frontend phase.

- [ ] **Step 1: Document calculation recommendations and saved-trip persistence**

Add this behavior to the endpoint descriptions:

```markdown
- Receipt calculation responses include sorted eco-swap recommendations and total estimated savings after final item emissions are resolved.
- Saved trips preserve their ordered eco-swap recommendations; legacy trips without recommendations remain valid and return an empty list.
```

- [ ] **Step 2: Run the complete backend suite**

Run: `.venv/bin/python -m pytest tests -v`

Expected: all backend tests pass with zero failures.

- [ ] **Step 3: Run a deterministic local smoke calculation without external services**

Run:

```bash
CLIMATIQ_API_KEY= ANTHROPIC_API_KEY= .venv/bin/python -c 'from engine import CarbonEngine; r=CarbonEngine().analyze_receipt([{"raw_item":"BNDL GROUND BEEF 1LB","qty":1}]); assert r["eco_swap_recommendations"]; assert r["summary"]["potential_total_savings_kg"] == sum(x["potential_savings_kg"] for x in r["eco_swap_recommendations"]); print(r["eco_swap_recommendations"][0])'
```

Expected: prints the Ground Beef replacement recommendation and exits successfully.

- [ ] **Step 4: Confirm no frontend files or secrets were changed**

Run: `git status --short && git diff --name-only origin/main...HEAD`

Expected: committed backend files, backend tests, README, spec, and plan only; `.env.save` remains untracked and absent from commits.

- [ ] **Step 5: Commit backend documentation**

```bash
git add README.md
git commit -m "docs: describe eco swap persistence"
```

- [ ] **Step 6: Record the backend handoff contract for frontend work**

Use this exact frontend-facing mapping in the handoff:

```text
calculation.summary.potential_total_savings_kg -> CarbonResult.potentialTotalSavingsKg
calculation.eco_swap_recommendations[]         -> CarbonResult.ecoSwapRecommendations[]
savedTrip.ecoSwapRecommendations[]             -> Progress & Insights source data
```

The backend phase is complete only when the full suite and smoke calculation both pass.
