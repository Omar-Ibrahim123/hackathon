# Backend Trip History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist GreenerCart trip history in SQLite during live API mode, migrate existing browser trips without losing timestamps or legacy URLs, and preserve local-only mock mode.

**Architecture:** FastAPI exposes a camel-case Trips REST API backed by a focused SQLite `HistoryStore`; calculation endpoints remain persistence-free. The frontend selects an `HttpTripRepository` wrapped by a one-time migration coordinator in live mode and retains `LocalStorageTripRepository` in mock mode. SQLite keeps each migrated browser ID as a durable unique alias so old detail and delete URLs resolve after local cleanup.

**Tech Stack:** Python 3, SQLite, FastAPI, Pydantic, pytest, FastAPI TestClient/httpx, TypeScript, React, Vitest, Vite

**Spec:** `docs/superpowers/specs/2026-08-22-backend-trip-history-design.md`

## Global Constraints

- `TripRepository` remains `listTrips`, `getTrip`, `saveTrip`, and `deleteTrip`; pages must not call storage or HTTP directly.
- Receipt calculations save automatically through the repository; manual calculations save only after **Save to history**.
- `/api/receipts/scan` and `/api/receipts/analyze` calculate only and never write history.
- Regular `POST /api/trips` assigns the canonical ID and current UTC timestamp.
- Migration preserves original UTC timestamps, is transactional and idempotent, and clears only `greenercart.saved-trips` after complete success.
- `GET` and `DELETE /api/trips/{id}` resolve canonical IDs and durable legacy import keys.
- Live mode uses backend history; mock or missing mode uses local storage.
- Existing valid browser trips are not silently discarded on any failure.
- No accounts, user isolation, chart dependency, or server-generated progress analytics are added.

## File Structure

- `history.py`: SQLite schema, canonical trip mapping, CRUD, atomic import, conflicts, and durable-reference resolution.
- `tests/test_history.py`: temporary-database unit tests for the store.
- `main.py`: Pydantic transport models, dependency-injected history store, and Trips endpoints.
- `tests/test_trip_api.py`: FastAPI endpoint and calculation-boundary tests.
- `requirements-dev.txt`: Python test-only dependencies.
- `data/.gitkeep` and `.gitignore`: persistent data directory without committed databases.
- `src/apiConfig.ts`: one source of truth for API mode and base URL.
- `src/history/tripValidation.ts`: runtime validation of backend trip JSON.
- `src/history/HttpTripRepository.ts`: REST implementation plus batch import operation.
- `src/history/HttpTripRepository.test.ts`: HTTP contract and failure tests.
- `src/history/MigratingTripRepository.ts`: one-time, retry-safe migration gate around the HTTP repository.
- `src/history/MigratingTripRepository.test.ts`: migration success, failure, concurrency, and legacy-ID tests.
- `src/history/createTripRepository.ts`: mock/live repository selection.
- `src/history/createTripRepository.test.ts`: selection tests.
- `src/history/LocalStorageTripRepository.ts`: add scoped trip-envelope clearing for migration.
- `src/main.tsx`: construct the selected repository.
- `README.md`: backend history, migration, and live-mode instructions.

---

### Task 1: SQLite Trip Store CRUD

**Files:**
- Create: `history.py`
- Create: `tests/test_history.py`
- Create: `requirements-dev.txt`
- Create: `data/.gitkeep`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: normalized dictionaries shaped like `NewTrip`/`SavedTrip` from the spec.
- Produces: `HistoryStore(database_path, now=None)`, `create_trip(trip)`, `list_trips()`, `get_trip(reference)`, and `delete_trip(reference)`.

- [ ] **Step 1: Add Python test dependencies and write failing CRUD tests**

Add `requirements-dev.txt`:

```text
-r requirements.txt
pytest
httpx
```

Create `tests/test_history.py` with a temporary database fixture and literal domain data:

```python
from datetime import datetime, timezone

from history import HistoryStore


NEW_TRIP = {
    "source": "receipt",
    "totalCo2eKg": 6.4,
    "items": [{"id": "item-0", "name": "Milk", "co2eKg": 1.2}],
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
```

Add a second test that creates two trips at different timestamps, verifies newest-first ordering, item order, and uses `PRAGMA foreign_keys` plus a direct item count assertion after deletion.

- [ ] **Step 2: Create the isolated Python environment**

Run:

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
```

Expected: installation succeeds and `.venv/bin/python -c "import fastapi, pytest"` exits 0.

- [ ] **Step 3: Run the store tests and verify RED**

Run: `.venv/bin/python -m pytest tests/test_history.py -v`

Expected: FAIL because `history.py` and `HistoryStore` do not exist.

- [ ] **Step 4: Implement the minimal SQLite store**

Implement `history.py` with these exact public signatures: `HistoryStore(database_path: str = "data/history.db", now: Callable[[], datetime] | None = None)`, `create_trip(trip: dict) -> dict`, `list_trips() -> list[dict]`, `get_trip(reference: str) -> dict | None`, and `delete_trip(reference: str) -> bool`.

```sql
CREATE TABLE trips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    import_key TEXT UNIQUE,
    source TEXT NOT NULL CHECK (source IN ('receipt', 'manual')),
    saved_at TEXT NOT NULL,
    total_co2e_kg REAL NOT NULL CHECK (total_co2e_kg >= 0)
);
```

Create `trips(id, import_key, source, saved_at, total_co2e_kg)` and `trip_items(id, trip_id, item_id, position, name, item_co2e_kg)` with `ON DELETE CASCADE`. Every `_connect()` call must execute `PRAGMA foreign_keys = ON`. Encode canonical row IDs as `trip_<integer>`, hydrate complete camel-case trip dictionaries, order trips by `saved_at DESC, id DESC`, and order items by `position`.

Add `*.db` to `.gitignore` and keep `data/` with `data/.gitkeep`.

- [ ] **Step 5: Run CRUD tests and verify GREEN**

Run: `.venv/bin/python -m pytest tests/test_history.py -v`

Expected: all CRUD, ordering, and cascade tests PASS.

- [ ] **Step 6: Commit the SQLite CRUD batch**

```bash
git add .gitignore data/.gitkeep history.py requirements-dev.txt tests/test_history.py
git commit -m "feat: add SQLite trip history store"
```

---

### Task 2: Atomic Migration and Durable Legacy References

**Files:**
- Modify: `history.py`
- Modify: `tests/test_history.py`

**Interfaces:**
- Consumes: `SavedTrip` dictionaries whose `id` is the original browser UUID and whose `savedAt` is timezone-aware ISO 8601.
- Produces: `import_trips(trips: list[dict]) -> list[dict]` and `HistoryConflictError`; existing `get_trip`/`delete_trip` accept canonical or imported references.

- [ ] **Step 1: Write failing migration and legacy-reference tests**

Add literal tests covering timestamp preservation, canonical IDs, idempotency, conflicts, and restart durability:

```python
def test_import_is_idempotent_and_legacy_reference_survives_restart(tmp_path):
    path = str(tmp_path / "history.db")
    imported = {
        **NEW_TRIP,
        "id": "147ba6a4-eefd-4dce-99a1-17d31ff7291c",
        "savedAt": "2026-07-05T16:00:00+00:00",
    }
    first = HistoryStore(path).import_trips([imported])
    second = HistoryStore(path).import_trips([imported])

    assert first == second
    assert first[0]["id"] == "trip_1"
    assert first[0]["savedAt"] == imported["savedAt"]
    reopened = HistoryStore(path)
    assert reopened.get_trip(imported["id"]) == first[0]
    assert reopened.delete_trip(imported["id"]) is True
    assert reopened.get_trip("trip_1") is None
```

Add a conflict test that changes `totalCo2eKg` for the same import ID and expects `HistoryConflictError`. Add an atomicity test with one conflicting entry in a two-trip batch and assert the new entry was not committed.

- [ ] **Step 2: Run migration tests and verify RED**

Run: `.venv/bin/python -m pytest tests/test_history.py -k "import or legacy" -v`

Expected: FAIL because `import_trips` and `HistoryConflictError` are missing and legacy IDs do not resolve.

- [ ] **Step 3: Implement atomic idempotent import**

Add:

```python
class HistoryConflictError(Exception):
    pass
```

Add `HistoryStore.import_trips(self, trips: list[dict]) -> list[dict]`. Perform the entire batch using one SQLite connection context. Normalize incoming aware timestamps to UTC. For each input ID, query `import_key`; return the existing canonical row only when source, timestamp, total, and ordered items exactly match. Raise `HistoryConflictError` on any mismatch so the transaction rolls back. Insert new rows with `import_key=<browser id>` and the original normalized timestamp.

Update reference resolution to parse `trip_<integer>` first and otherwise query exact `import_key`. Use the same resolver for lookup and deletion so an old URL identifies the same row after restart.

- [ ] **Step 4: Run all store tests and verify GREEN**

Run: `.venv/bin/python -m pytest tests/test_history.py -v`

Expected: all CRUD, migration, conflict, atomicity, and legacy-reference tests PASS.

- [ ] **Step 5: Commit migration support**

```bash
git add history.py tests/test_history.py
git commit -m "feat: migrate browser trips into SQLite"
```

---

### Task 3: FastAPI Trips Contract

**Files:**
- Modify: `main.py`
- Create: `tests/test_trip_api.py`

**Interfaces:**
- Consumes: `HistoryStore` and `HistoryConflictError` from Tasks 1–2.
- Produces: `GET /api/trips`, `GET /api/trips/{id}`, `POST /api/trips`, `DELETE /api/trips/{id}`, and `POST /api/trips/import`.

- [ ] **Step 1: Write failing endpoint contract tests**

Use `fastapi.testclient.TestClient`, set `HISTORY_DB_PATH` to a temporary path before constructing the app store, and exercise real HTTP serialization:

```python
def test_trip_crud_contract(client):
    response = client.post("/api/trips", json=NEW_TRIP)
    assert response.status_code == 201
    saved = response.json()
    assert saved["id"].startswith("trip_")
    assert saved["source"] == "receipt"

    assert client.get("/api/trips").json() == [saved]
    assert client.get(f"/api/trips/{saved['id']}").json() == saved
    assert client.delete(f"/api/trips/{saved['id']}").status_code == 204
    assert client.get(f"/api/trips/{saved['id']}").status_code == 404
```

Add tests for `422` invalid trips, `404` lookup/delete, `409` import conflict, preserved imported timestamp, canonical response through a legacy ID, and deletion through a legacy ID.

Add calculation-boundary tests that replace `main.engine` with a deterministic fake. Call `/api/receipts/analyze` and `/api/receipts/scan` separately, then assert after each request that `GET /api/trips` remains empty.

- [ ] **Step 2: Run API tests and verify RED**

Run: `.venv/bin/python -m pytest tests/test_trip_api.py -v`

Expected: FAIL with `404` for missing Trips routes.

- [ ] **Step 3: Add Pydantic models and dependency-injected endpoints**

Define transport models with the approved camel-case fields:

```python
class TripItemModel(BaseModel):
    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    co2eKg: float = Field(ge=0, allow_inf_nan=False)

class NewTripModel(BaseModel):
    source: Literal["receipt", "manual"]
    totalCo2eKg: float = Field(ge=0, allow_inf_nan=False)
    items: list[TripItemModel]

class SavedTripModel(NewTripModel):
    id: str
    savedAt: datetime

class ImportTripsRequest(BaseModel):
    trips: list[SavedTripModel]
```

Create one module-level `HistoryStore(os.getenv("HISTORY_DB_PATH", "data/history.db"))` and a `get_history_store()` FastAPI dependency that tests can override. Return `201` for save, `204` for deletion, `404` for missing references, and translate `HistoryConflictError` to `409`.

Do not add persistence calls to either calculation endpoint.

- [ ] **Step 4: Run backend tests and verify GREEN**

Run: `.venv/bin/python -m pytest tests/test_history.py tests/test_trip_api.py -v`

Expected: all backend tests PASS.

- [ ] **Step 5: Commit the REST API**

```bash
git add main.py tests/test_trip_api.py
git commit -m "feat: expose trip history API"
```

---

### Task 4: Frontend HTTP Trip Repository

**Files:**
- Create: `src/apiConfig.ts`
- Modify: `src/api.ts`
- Create: `src/history/tripValidation.ts`
- Create: `src/history/HttpTripRepository.ts`
- Create: `src/history/HttpTripRepository.test.ts`

**Interfaces:**
- Consumes: `NewTrip`, `SavedTrip`, `TripRepository`, `TripRepositoryError`, and the backend API from Task 3.
- Produces: `apiMode`, `apiBaseUrl`, `parseSavedTrip(value)`, `ImportingTripRepository`, `HttpTripRepository`, and `importTrips(trips)`.

- [ ] **Step 1: Write failing HTTP repository tests**

Stub `global.fetch` and assert real observable repository behavior:

```ts
it("saves a trip and returns the backend canonical record", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
    JSON.stringify({
      ...newTrip,
      id: "trip_9",
      savedAt: "2026-08-22T15:00:00.000Z",
    }),
    { status: 201, headers: { "Content-Type": "application/json" } },
  )));
  const repository = new HttpTripRepository("https://api.example.test");

  await expect(repository.saveTrip(newTrip)).resolves.toMatchObject({ id: "trip_9" });
  expect(fetch).toHaveBeenCalledWith(
    "https://api.example.test/api/trips",
    expect.objectContaining({ method: "POST", body: JSON.stringify(newTrip) }),
  );
});
```

Add tests for newest-first list parsing, canonical and legacy `getTrip` paths, `404 -> null`, delete with `204`, import request/response, encoded IDs, network errors, backend error detail, and malformed success JSON.

- [ ] **Step 2: Run repository tests and verify RED**

Run: `npm test -- src/history/HttpTripRepository.test.ts`

Expected: FAIL because `HttpTripRepository` does not exist.

- [ ] **Step 3: Implement API configuration, validators, and repository**

Move mode/base-URL resolution from `src/api.ts` into `src/apiConfig.ts` without changing calculation behavior:

```ts
export const apiMode = resolveApiMode(import.meta.env.VITE_API_MODE);
export const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000")
  .replace(/\/$/, "");
```

Implement runtime validators that require exact domain field types, finite non-negative numbers, valid dates, and complete item arrays. Define the structural migration boundary and implement it in `HttpTripRepository`:

```ts
export interface ImportingTripRepository extends TripRepository {
  importTrips(trips: SavedTrip[]): Promise<SavedTrip[]>;
}

export class HttpTripRepository implements ImportingTripRepository {
  constructor(private readonly baseUrl = apiBaseUrl) {}
}
```

Implement all five class methods: `listTrips`, `getTrip`, `saveTrip`, `deleteTrip`, and `importTrips`. Encode path identifiers with `encodeURIComponent`. Convert non-2xx responses, network failures, JSON parse failures, and invalid success bodies into `TripRepositoryError`; preserve a non-empty backend `detail` message when available.

- [ ] **Step 4: Run API and repository tests and verify GREEN**

Run: `npm test -- src/api.test.ts src/history/HttpTripRepository.test.ts`

Expected: both calculation API and repository tests PASS.

- [ ] **Step 5: Commit the HTTP adapter**

```bash
git add src/api.ts src/apiConfig.ts src/history/tripValidation.ts src/history/HttpTripRepository.ts src/history/HttpTripRepository.test.ts
git commit -m "feat: add HTTP trip repository"
```

---

### Task 5: One-Time Browser Migration Gate

**Files:**
- Modify: `src/history/LocalStorageTripRepository.ts`
- Modify: `src/history/LocalStorageTripRepository.test.ts`
- Create: `src/history/MigratingTripRepository.ts`
- Create: `src/history/MigratingTripRepository.test.ts`

**Interfaces:**
- Consumes: `LocalStorageTripRepository`, `ImportingTripRepository`, and `TripRepository`.
- Produces: `LocalStorageTripRepository.clearTrips()` and `MigratingTripRepository` implementing `TripRepository`.

- [ ] **Step 1: Write failing scoped-clear and migration tests**

Add a local-storage test proving `clearTrips()` removes only `greenercart.saved-trips` and leaves `greenercart.welcome-complete` unchanged.

Create migration tests with real local storage and a small fake remote implementing the HTTP boundary:

```ts
it("imports once, preserves timestamps, then clears local trips", async () => {
  const local = new LocalStorageTripRepository(storage, () => "legacy-id", () => oldDate);
  const original = await local.saveTrip(newTrip);
  const remote = new RecordingHttpRepository([{ ...original, id: "trip_1" }]);
  const repository = new MigratingTripRepository(local, remote);

  await expect(repository.listTrips()).resolves.toEqual([{ ...original, id: "trip_1" }]);
  await repository.listTrips();
  expect(remote.importCalls).toEqual([[original]]);
  await expect(local.listTrips()).resolves.toEqual([]);
  expect(storage.getItem("greenercart.welcome-complete")).toBe("true");
});
```

Add tests for concurrent operations sharing one import, failed import retaining local records and blocking the original operation, response-count mismatch retaining local records, and `getTrip(legacyId)`/`deleteTrip(legacyId)` passing the legacy value through after migration.

- [ ] **Step 2: Run migration tests and verify RED**

Run: `npm test -- src/history/LocalStorageTripRepository.test.ts src/history/MigratingTripRepository.test.ts`

Expected: FAIL because `clearTrips` and `MigratingTripRepository` do not exist.

- [ ] **Step 3: Implement scoped cleanup and shared migration promise**

Add:

```ts
clearTrips(): void {
  try {
    this.storage.removeItem(STORAGE_KEY);
  } catch {
    throw new TripRepositoryError("Unable to clear migrated trip history.");
  }
}
```

Implement the wrapper with one lazily created promise:

```ts
export class MigratingTripRepository implements TripRepository {
  private migration: Promise<void> | null = null;
  constructor(
    private readonly local: LocalStorageTripRepository,
    private readonly remote: ImportingTripRepository,
  ) {}

  private ensureMigrated(): Promise<void> {
    this.migration ??= this.migrate();
    return this.migration;
  }

  private async migrate(): Promise<void> {
    const trips = await this.local.listTrips();
    if (trips.length === 0) return;
    const imported = await this.remote.importTrips(trips);
    if (imported.length !== trips.length) {
      throw new TripRepositoryError(
        "The trip migration returned an incomplete result.",
      );
    }
    this.local.clearTrips();
  }

  async listTrips() { await this.ensureMigrated(); return this.remote.listTrips(); }
  async getTrip(id: string) { await this.ensureMigrated(); return this.remote.getTrip(id); }
  async saveTrip(trip: NewTrip) { await this.ensureMigrated(); return this.remote.saveTrip(trip); }
  async deleteTrip(id: string) { await this.ensureMigrated(); return this.remote.deleteTrip(id); }
}
```

`ensureMigrated` lists local trips, skips import for an empty list, validates that the canonical response count equals the input count, and calls `clearTrips` only after success. Leave a rejected promise in place for the session; a reload constructs a new wrapper and retries safely.

- [ ] **Step 4: Run migration tests and verify GREEN**

Run: `npm test -- src/history/LocalStorageTripRepository.test.ts src/history/MigratingTripRepository.test.ts`

Expected: all local cleanup, migration, concurrency, failure, and legacy passthrough tests PASS.

- [ ] **Step 5: Commit the migration gate**

```bash
git add src/history/LocalStorageTripRepository.ts src/history/LocalStorageTripRepository.test.ts src/history/MigratingTripRepository.ts src/history/MigratingTripRepository.test.ts
git commit -m "feat: migrate local trip history in live mode"
```

---

### Task 6: Repository Selection and Application Activation

**Files:**
- Create: `src/history/createTripRepository.ts`
- Create: `src/history/createTripRepository.test.ts`
- Modify: `src/main.tsx`

**Interfaces:**
- Consumes: `apiMode`, `apiBaseUrl`, local, HTTP, and migration-aware repositories.
- Produces: `createTripRepository({ mode, baseUrl, storage }) -> TripRepository` and live-mode app activation.

- [ ] **Step 1: Write failing repository-selection tests**

```ts
it("uses local storage in mock mode", () => {
  expect(createTripRepository({ mode: "mock", storage }))
    .toBeInstanceOf(LocalStorageTripRepository);
});

it("uses migration-aware HTTP history in live mode", () => {
  expect(createTripRepository({ mode: "live", baseUrl: "https://api.test", storage }))
    .toBeInstanceOf(MigratingTripRepository);
});
```

- [ ] **Step 2: Run selection tests and verify RED**

Run: `npm test -- src/history/createTripRepository.test.ts`

Expected: FAIL because the factory does not exist.

- [ ] **Step 3: Implement the factory and update the composition root**

Implement a factory with explicit injectable arguments for tests and defaults for production. In `src/main.tsx`, replace direct `new LocalStorageTripRepository()` with:

```ts
const repository = createTripRepository({
  mode: apiMode,
  baseUrl: apiBaseUrl,
  storage: window.localStorage,
});
```

Do not change any page component or the `TripRepository` interface.

- [ ] **Step 4: Run all frontend tests and build**

Run: `npm test`

Expected: all frontend tests PASS.

Run: `npm run build`

Expected: TypeScript and Vite build succeed with exit code 0.

- [ ] **Step 5: Commit live-mode activation**

```bash
git add src/history/createTripRepository.ts src/history/createTripRepository.test.ts src/main.tsx
git commit -m "feat: use backend history in live mode"
```

---

### Task 7: Documentation and Live End-to-End Verification

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: completed backend API, live repository, and migration behavior.
- Produces: reproducible local startup and verification instructions.

- [ ] **Step 1: Document live backend history and migration**

Update README to state:

```text
Live mode stores trip history in SQLite at data/history.db by default.
Set HISTORY_DB_PATH to override the database location.
On first live-mode history access, valid local browser trips migrate to SQLite,
retain their original timestamps, and keep their old /history/{id} URLs working.
Mock mode continues to store history only in the current browser.
```

Keep the existing two-terminal startup commands and add `.venv/bin/python -m pytest tests -v` to the verification section.

- [ ] **Step 2: Run complete automated verification**

Run: `.venv/bin/python -m pytest tests -v`

Expected: all backend store and FastAPI tests PASS.

Run: `npm test`

Expected: all frontend tests PASS.

Run: `npm run build`

Expected: production build succeeds.

Run: `git diff --check`

Expected: exit code 0 with no whitespace errors.

- [ ] **Step 3: Run a temporary-database live smoke test**

Start the backend with an explicit disposable database:

```bash
HISTORY_DB_PATH=/tmp/greenercart-history-smoke.db .venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000
```

Start the frontend:

```bash
VITE_API_MODE=live VITE_API_BASE_URL=http://127.0.0.1:8000 npm run dev -- --host 127.0.0.1
```

Verify in the local browser: an existing local trip migrates with its date, its old detail URL opens, deletion from that URL succeeds, a receipt result saves automatically, a manual result remains absent until **Save to history**, and Progress reflects the latest saved uploads.

- [ ] **Step 4: Commit documentation**

```bash
git add README.md
git commit -m "docs: explain backend trip history"
```

- [ ] **Step 5: Confirm clean completion state**

Run: `git status --short`

Expected: no output.

Run: `git log -7 --oneline`

Expected: seven focused history implementation commits, ending with documentation.
