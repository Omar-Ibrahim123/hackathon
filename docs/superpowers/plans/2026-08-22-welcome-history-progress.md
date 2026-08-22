# Welcome, History, and Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one-time onboarding, frontend-persisted trip history, read-only trip details with deletion, and six-month progress insights without changing the existing calculation backend contract.

**Architecture:** React Router turns the current calculator into the Home route and adds Welcome, History, Trip Details, and Progress routes inside a shared shell. Pages use an asynchronous `TripRepository`; the initial adapter owns canonical IDs and timestamps in versioned `localStorage`, while pure progress functions derive chart data and insights from `SavedTrip[]`.

**Tech Stack:** React 19, TypeScript 7, Vite 8, React Router, Tailwind CSS 4, Vitest, Testing Library, browser `localStorage`

**Spec:** `docs/superpowers/specs/2026-08-22-welcome-history-progress-design.md`

## Global Constraints

- Keep the existing receipt and manual calculation API integration unchanged.
- Receipt calculations save automatically; manual calculations save only after an explicit action.
- Saved trips are read-only and deletable only after confirmation.
- History is a plain chronological list with no search, filtering, charts, or aggregate summary.
- Progress covers the current local calendar month and five preceding calendar months.
- Pages must not access `localStorage` directly; saved-trip persistence goes through `TripRepository`.
- `saveTrip(NewTrip)` returns the canonical `SavedTrip`; persistence assigns `id` and `savedAt`.
- Do not add a chart library.
- Preserve responsive behavior, visible focus, semantic controls, and reduced-motion support.

## Planned File Structure

- `src/history/types.ts` — persisted trip types.
- `src/history/TripRepository.ts` — repository interface and controlled error type.
- `src/history/LocalStorageTripRepository.ts` — versioned browser adapter, validation, canonical ID/time assignment.
- `src/history/TripRepositoryContext.tsx` — repository injection for routes and tests.
- `src/history/tripMapping.ts` — maps a calculation result to `NewTrip`.
- `src/history/progress.ts` — pure six-month aggregation and insight calculations.
- `src/welcome/welcomePreference.ts` — welcome-complete preference access.
- `src/components/AppShell.tsx` — shared brand and route navigation.
- `src/components/ConfirmDialog.tsx` — accessible destructive confirmation.
- `src/components/ProgressChart.tsx` — accessible dependency-free monthly bars.
- `src/pages/HomePage.tsx` — existing calculator plus save orchestration.
- `src/pages/WelcomePage.tsx` — one-time onboarding.
- `src/pages/HistoryPage.tsx` — newest-first trip list.
- `src/pages/TripDetailsPage.tsx` — read-only detail and deletion.
- `src/pages/ProgressPage.tsx` — chart and insight cards.
- `src/pages/NotFoundPage.tsx` — unknown-route recovery.
- `src/test/renderApp.tsx` — router and repository-aware test renderer.
- `src/App.tsx` — route table and first-launch gate.
- `src/main.tsx` — browser router and production repository wiring.
- `src/styles.css` — shared shell, pages, chart, states, and responsive styles.

---

### Task 1: Saved-trip domain and local repository

**Files:**
- Create: `src/history/types.ts`
- Create: `src/history/TripRepository.ts`
- Create: `src/history/LocalStorageTripRepository.ts`
- Create: `src/history/LocalStorageTripRepository.test.ts`

**Interfaces:**
- Consumes: Browser `Storage`, `crypto.randomUUID()`, and `Date`.
- Produces: `TripSource`, `SavedTripItem`, `NewTrip`, `SavedTrip`, `TripRepository`, `TripRepositoryError`, and `LocalStorageTripRepository`.

- [ ] **Step 1: Write repository tests that define canonical save behavior and validation**

Create `src/history/LocalStorageTripRepository.test.ts` with focused cases:

```ts
import { beforeEach, describe, expect, it } from "vitest";

import { LocalStorageTripRepository } from "./LocalStorageTripRepository";
import { TripRepositoryError } from "./TripRepository";
import type { NewTrip } from "./types";

const newTrip: NewTrip = {
  source: "receipt",
  totalCo2eKg: 6.4,
  items: [{ id: "beef", name: "Ground beef", co2eKg: 3.1 }],
};

describe("LocalStorageTripRepository", () => {
  beforeEach(() => window.localStorage.clear());

  it("assigns and returns the canonical id and timestamp", async () => {
    const repository = new LocalStorageTripRepository(
      window.localStorage,
      () => "trip-123",
      () => new Date("2026-08-22T12:00:00.000Z"),
    );

    const saved = await repository.saveTrip(newTrip);

    expect(saved).toEqual({
      ...newTrip,
      id: "trip-123",
      savedAt: "2026-08-22T12:00:00.000Z",
    });
    await expect(repository.getTrip("trip-123")).resolves.toEqual(saved);
    await expect(repository.listTrips()).resolves.toEqual([saved]);
  });

  it("deletes only the requested trip", async () => {
    let id = 0;
    const repository = new LocalStorageTripRepository(
      window.localStorage,
      () => `trip-${++id}`,
      () => new Date("2026-08-22T12:00:00.000Z"),
    );
    const first = await repository.saveTrip(newTrip);
    const second = await repository.saveTrip({ ...newTrip, source: "manual" });

    await repository.deleteTrip(first.id);

    await expect(repository.listTrips()).resolves.toEqual([second]);
    await expect(repository.getTrip(first.id)).resolves.toBeNull();
  });

  it("rejects malformed versioned data instead of returning partial trips", async () => {
    window.localStorage.setItem(
      "greenercart.saved-trips",
      JSON.stringify({ version: 1, trips: [{ id: "broken" }] }),
    );
    const repository = new LocalStorageTripRepository(window.localStorage);

    await expect(repository.listTrips()).rejects.toBeInstanceOf(
      TripRepositoryError,
    );
  });

  it("converts browser write failures into a controlled repository error", async () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("Quota exceeded");
      },
    } as unknown as Storage;
    const repository = new LocalStorageTripRepository(storage);

    await expect(repository.saveTrip(newTrip)).rejects.toThrow(
      "Unable to save trip history.",
    );
  });
});
```

- [ ] **Step 2: Run the repository test and verify it fails**

Run: `npm test -- src/history/LocalStorageTripRepository.test.ts`

Expected: FAIL because the history modules do not exist.

- [ ] **Step 3: Add the domain types and repository contract**

Create `src/history/types.ts`:

```ts
export type TripSource = "receipt" | "manual";

export interface SavedTripItem {
  id: string;
  name: string;
  co2eKg: number;
}

export interface NewTrip {
  source: TripSource;
  totalCo2eKg: number;
  items: SavedTripItem[];
}

export interface SavedTrip extends NewTrip {
  id: string;
  savedAt: string;
}
```

Create `src/history/TripRepository.ts`:

```ts
import type { NewTrip, SavedTrip } from "./types";

export interface TripRepository {
  listTrips(): Promise<SavedTrip[]>;
  getTrip(id: string): Promise<SavedTrip | null>;
  saveTrip(trip: NewTrip): Promise<SavedTrip>;
  deleteTrip(id: string): Promise<void>;
}

export class TripRepositoryError extends Error {
  constructor(message = "Unable to access saved trip history.") {
    super(message);
    this.name = "TripRepositoryError";
  }
}
```

- [ ] **Step 4: Implement the versioned local-storage adapter**

Create `src/history/LocalStorageTripRepository.ts` with:

```ts
import { TripRepositoryError, type TripRepository } from "./TripRepository";
import type { NewTrip, SavedTrip, SavedTripItem, TripSource } from "./types";

const STORAGE_KEY = "greenercart.saved-trips";
const STORAGE_VERSION = 1;

interface StoredTrips {
  version: 1;
  trips: SavedTrip[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isSource(value: unknown): value is TripSource {
  return value === "receipt" || value === "manual";
}

function isItem(value: unknown): value is SavedTripItem {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.name === "string" &&
    value.name.trim().length > 0 &&
    isNonNegativeNumber(value.co2eKg)
  );
}

function isTrip(value: unknown): value is SavedTrip {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    isSource(value.source) &&
    typeof value.savedAt === "string" &&
    Number.isFinite(Date.parse(value.savedAt)) &&
    isNonNegativeNumber(value.totalCo2eKg) &&
    Array.isArray(value.items) &&
    value.items.every(isItem)
  );
}

export class LocalStorageTripRepository implements TripRepository {
  constructor(
    private readonly storage: Storage = window.localStorage,
    private readonly createId: () => string = () => crypto.randomUUID(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  private read(): SavedTrip[] {
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (raw === null) return [];
      const value: unknown = JSON.parse(raw);
      if (
        !isRecord(value) ||
        value.version !== STORAGE_VERSION ||
        !Array.isArray(value.trips) ||
        !value.trips.every(isTrip)
      ) {
        throw new TripRepositoryError();
      }
      return value.trips;
    } catch (error) {
      if (error instanceof TripRepositoryError) throw error;
      throw new TripRepositoryError();
    }
  }

  private write(trips: SavedTrip[]): void {
    const envelope: StoredTrips = { version: STORAGE_VERSION, trips };
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(envelope));
    } catch {
      throw new TripRepositoryError("Unable to save trip history.");
    }
  }

  async listTrips(): Promise<SavedTrip[]> {
    return this.read();
  }

  async getTrip(id: string): Promise<SavedTrip | null> {
    return this.read().find((trip) => trip.id === id) ?? null;
  }

  async saveTrip(trip: NewTrip): Promise<SavedTrip> {
    const savedTrip: SavedTrip = {
      ...trip,
      id: this.createId(),
      savedAt: this.now().toISOString(),
    };
    this.write([...this.read(), savedTrip]);
    return savedTrip;
  }

  async deleteTrip(id: string): Promise<void> {
    this.write(this.read().filter((trip) => trip.id !== id));
  }
}
```

- [ ] **Step 5: Run the repository tests**

Run: `npm test -- src/history/LocalStorageTripRepository.test.ts`

Expected: 4 tests PASS.

- [ ] **Step 6: Commit the persistence foundation**

```bash
git add src/history
git commit -m "feat: add saved trip repository"
```

---

### Task 2: Pure progress aggregation

**Files:**
- Create: `src/history/progress.ts`
- Create: `src/history/progress.test.ts`

**Interfaces:**
- Consumes: `SavedTrip[]` from Task 1 and a `Date` representing the user's current local time.
- Produces: `buildProgressSummary(trips: SavedTrip[], now?: Date): ProgressSummary`.

- [ ] **Step 1: Write failing tests for the six-month window and insight rules**

Create `src/history/progress.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { SavedTrip } from "./types";
import { buildProgressSummary } from "./progress";

function trip(id: string, savedAt: string, totalCo2eKg: number): SavedTrip {
  return { id, savedAt, totalCo2eKg, source: "receipt", items: [] };
}

describe("buildProgressSummary", () => {
  it("builds oldest-to-current local calendar month totals", () => {
    const summary = buildProgressSummary(
      [
        trip("march", "2026-03-10T12:00:00", 2),
        trip("july-a", "2026-07-03T12:00:00", 4),
        trip("july-b", "2026-07-20T12:00:00", 6),
        trip("august", "2026-08-02T12:00:00", 15),
        trip("old", "2026-02-10T12:00:00", 100),
      ],
      new Date("2026-08-22T12:00:00"),
    );

    expect(summary.months.map((month) => month.totalCo2eKg)).toEqual([
      2, 0, 0, 0, 10, 15,
    ]);
    expect(summary.currentMonthChangePercent).toBe(50);
    expect(summary.averageTripCo2eKg).toBeCloseTo(6.75);
    expect(summary.highestImpactTrip?.id).toBe("august");
  });

  it("omits percentage change when the previous month is zero", () => {
    const summary = buildProgressSummary(
      [trip("august", "2026-08-02T12:00:00", 5)],
      new Date("2026-08-22T12:00:00"),
    );

    expect(summary.currentMonthChangePercent).toBeNull();
  });

  it("returns empty insights when the window contains no trips", () => {
    const summary = buildProgressSummary([], new Date("2026-08-22T12:00:00"));

    expect(summary.tripCount).toBe(0);
    expect(summary.averageTripCo2eKg).toBeNull();
    expect(summary.highestImpactTrip).toBeNull();
  });

  it("uses the newest trip when highest-impact totals tie", () => {
    const summary = buildProgressSummary(
      [
        trip("older", "2026-08-02T12:00:00", 5),
        trip("newer", "2026-08-12T12:00:00", 5),
      ],
      new Date("2026-08-22T12:00:00"),
    );

    expect(summary.highestImpactTrip?.id).toBe("newer");
  });
});
```

- [ ] **Step 2: Run the progress test and verify it fails**

Run: `npm test -- src/history/progress.test.ts`

Expected: FAIL because `progress.ts` does not exist.

- [ ] **Step 3: Implement month keys, labels, and summary calculation**

Create `src/history/progress.ts` defining these exact public shapes:

```ts
import type { SavedTrip } from "./types";

export interface ProgressMonth {
  key: string;
  label: string;
  totalCo2eKg: number;
}

export interface ProgressSummary {
  months: ProgressMonth[];
  tripCount: number;
  currentMonthChangePercent: number | null;
  averageTripCo2eKg: number | null;
  highestImpactTrip: SavedTrip | null;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function buildProgressSummary(
  trips: SavedTrip[],
  now = new Date(),
): ProgressSummary {
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
    return {
      key: monthKey(date),
      label: date.toLocaleDateString("en-CA", { month: "short" }),
      totalCo2eKg: 0,
    };
  });
  const monthByKey = new Map(months.map((month) => [month.key, month]));
  const tripsInWindow = trips.filter((trip) => {
    const month = monthByKey.get(monthKey(new Date(trip.savedAt)));
    if (!month) return false;
    month.totalCo2eKg += trip.totalCo2eKg;
    return true;
  });
  const previous = months[4].totalCo2eKg;
  const current = months[5].totalCo2eKg;
  const total = tripsInWindow.reduce(
    (sum, trip) => sum + trip.totalCo2eKg,
    0,
  );
  const highestImpactTrip = tripsInWindow.reduce<SavedTrip | null>(
    (highest, trip) => {
      if (highest === null || trip.totalCo2eKg > highest.totalCo2eKg) {
        return trip;
      }
      if (
        trip.totalCo2eKg === highest.totalCo2eKg &&
        Date.parse(trip.savedAt) > Date.parse(highest.savedAt)
      ) {
        return trip;
      }
      return highest;
    },
    null,
  );

  return {
    months,
    tripCount: tripsInWindow.length,
    currentMonthChangePercent:
      previous > 0 ? ((current - previous) / previous) * 100 : null,
    averageTripCo2eKg:
      tripsInWindow.length > 0 ? total / tripsInWindow.length : null,
    highestImpactTrip,
  };
}
```

- [ ] **Step 4: Run the progress tests**

Run: `npm test -- src/history/progress.test.ts`

Expected: 4 tests PASS.

- [ ] **Step 5: Commit progress calculations**

```bash
git add src/history/progress.ts src/history/progress.test.ts
git commit -m "feat: calculate six month progress"
```

---

### Task 3: Routing, welcome gate, and shared application shell

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/main.tsx`
- Replace: `src/App.tsx`
- Create: `src/history/TripRepositoryContext.tsx`
- Create: `src/welcome/welcomePreference.ts`
- Create: `src/components/AppShell.tsx`
- Create: `src/components/RouteFocus.tsx`
- Create: `src/pages/HomePage.tsx`
- Create: `src/pages/WelcomePage.tsx`
- Create: `src/pages/HistoryPage.tsx`
- Create: `src/pages/TripDetailsPage.tsx`
- Create: `src/pages/ProgressPage.tsx`
- Create: `src/pages/NotFoundPage.tsx`
- Create: `src/App.routing.test.tsx`
- Create: `src/test/renderApp.tsx`
- Create: `src/test/MemoryTripRepository.ts`
- Modify: `src/App.receipt.test.tsx`
- Modify: `src/App.manual.test.tsx`
- Modify: `src/App.toggle.test.tsx`

**Interfaces:**
- Consumes: `TripRepository` and `LocalStorageTripRepository` from Task 1.
- Produces: route table, `TripRepositoryProvider`, `useTripRepository()`, `WELCOME_STORAGE_KEY`, and shared route-aware test renderer.

- [ ] **Step 1: Install React Router**

Run: `npm install react-router-dom`

Expected: `react-router-dom` appears under `dependencies` and the lockfile updates.

- [ ] **Step 2: Write failing routing and welcome tests**

Create `src/App.routing.test.tsx` covering first launch, completion, navigation, and unknown routes:

```tsx
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { renderApp } from "./test/renderApp";
import { WELCOME_STORAGE_KEY } from "./welcome/welcomePreference";

describe("application routing", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(cleanup);

  it("shows welcome once and opens Home after completion", async () => {
    const user = userEvent.setup();
    renderApp({ route: "/" });

    expect(screen.getByRole("heading", { name: /welcome to greenercart/i }))
      .toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Start tracking" }));

    expect(window.localStorage.getItem(WELCOME_STORAGE_KEY)).toBe("true");
    expect(screen.getByRole("heading", {
      name: "Turn your grocery list into a clearer carbon picture.",
    })).toBeInTheDocument();
  });

  it("lets returning users navigate among product pages", async () => {
    window.localStorage.setItem(WELCOME_STORAGE_KEY, "true");
    const user = userEvent.setup();
    renderApp({ route: "/" });

    await user.click(screen.getByRole("link", { name: "History" }));
    expect(screen.getByRole("heading", { name: "History" })).toHaveFocus();
    await user.click(screen.getByRole("link", { name: "Progress & Insights" }));
    expect(screen.getByRole("heading", { name: "Progress & Insights" }))
      .toBeInTheDocument();
  });

  it("recovers from unknown routes", () => {
    window.localStorage.setItem(WELCOME_STORAGE_KEY, "true");
    renderApp({ route: "/missing" });
    expect(screen.getByRole("heading", { name: "Page not found" }))
      .toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the routing test and verify it fails**

Run: `npm test -- src/App.routing.test.tsx`

Expected: FAIL because routing, pages, and the test renderer do not exist.

- [ ] **Step 4: Move the current calculator into `HomePage` and update focused tests**

Run: `mkdir -p src/pages && git mv src/App.tsx src/pages/HomePage.tsx`

Update imports in `HomePage.tsx` from `./api`, `./components/...`, and `./types` to `../api`, `../components/...`, and `../types`. Remove the existing site header, outer `.page-shell`, and footer from Home while preserving its `<main>` calculator content; Task 3 moves those shared elements into `AppShell`. Update the existing receipt, manual, and toggle tests to import `HomePage` and render `<HomePage />`; do not change their assertions in this step.

- [ ] **Step 5: Add the repository context and welcome preference**

Create `src/history/TripRepositoryContext.tsx`:

```tsx
import { createContext, useContext, type ReactNode } from "react";

import type { TripRepository } from "./TripRepository";

const TripRepositoryContext = createContext<TripRepository | null>(null);

export function TripRepositoryProvider({
  repository,
  children,
}: {
  repository: TripRepository;
  children: ReactNode;
}) {
  return (
    <TripRepositoryContext.Provider value={repository}>
      {children}
    </TripRepositoryContext.Provider>
  );
}

export function useTripRepository(): TripRepository {
  const repository = useContext(TripRepositoryContext);
  if (repository === null) {
    throw new Error("TripRepositoryProvider is required.");
  }
  return repository;
}
```

Create `src/welcome/welcomePreference.ts`:

```ts
export const WELCOME_STORAGE_KEY = "greenercart.welcome-complete";

export function hasCompletedWelcome(storage: Storage = localStorage): boolean {
  return storage.getItem(WELCOME_STORAGE_KEY) === "true";
}

export function completeWelcome(storage: Storage = localStorage): void {
  storage.setItem(WELCOME_STORAGE_KEY, "true");
}
```

- [ ] **Step 6: Implement the route table, shell, and initial page states**

Create `AppShell.tsx` with a brand link, `<NavLink>` entries for `/`, `/history`, and `/progress`, an `<Outlet />`, and the existing footer copy. Rely on `NavLink`'s `aria-current="page"` to expose active navigation independently of color. Create `WelcomePage.tsx` with the approved explanation and **Start tracking**, calling `completeWelcome()` and `navigate("/", { replace: true })`.

Create `src/components/RouteFocus.tsx`:

```tsx
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export default function RouteFocus() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.querySelector<HTMLElement>("[data-route-heading]")?.focus();
  }, [pathname]);
  return null;
}
```

Give every route's primary `<h1>` `data-route-heading tabIndex={-1}`. Render `<RouteFocus />` immediately before `<Routes>` in `App` so Welcome and shell routes both receive focus after navigation.

Create `App.tsx` with this route structure:

```tsx
import { Navigate, Outlet, Route, Routes } from "react-router-dom";

import AppShell from "./components/AppShell";
import RouteFocus from "./components/RouteFocus";
import HistoryPage from "./pages/HistoryPage";
import HomePage from "./pages/HomePage";
import NotFoundPage from "./pages/NotFoundPage";
import ProgressPage from "./pages/ProgressPage";
import TripDetailsPage from "./pages/TripDetailsPage";
import WelcomePage from "./pages/WelcomePage";
import { hasCompletedWelcome } from "./welcome/welcomePreference";

function WelcomeGate() {
  return hasCompletedWelcome() ? <Outlet /> : <Navigate to="/welcome" replace />;
}

export default function App() {
  return (
    <>
      <RouteFocus />
      <Routes>
        <Route path="/welcome" element={<WelcomePage />} />
        <Route element={<WelcomeGate />}>
          <Route element={<AppShell />}>
            <Route index element={<HomePage />} />
            <Route path="history" element={<HistoryPage />} />
            <Route path="history/:id" element={<TripDetailsPage />} />
            <Route path="progress" element={<ProgressPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </>
  );
}
```

At this stage, History and Progress render their correct heading and approved empty-state explanation; Trip Details reads the route ID and renders a missing-trip recovery heading until Task 6 wires repository loading. Not Found renders **Page not found** and a Home link.

- [ ] **Step 7: Wire production and test providers**

Update `src/main.tsx` to create one repository and wrap the app:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import { LocalStorageTripRepository } from "./history/LocalStorageTripRepository";
import { TripRepositoryProvider } from "./history/TripRepositoryContext";
import "./styles.css";

const repository = new LocalStorageTripRepository();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <TripRepositoryProvider repository={repository}>
        <App />
      </TripRepositoryProvider>
    </BrowserRouter>
  </StrictMode>,
);
```

Create `src/test/MemoryTripRepository.ts` as the reusable test double:

```ts
import type { TripRepository } from "../history/TripRepository";
import type { NewTrip, SavedTrip } from "../history/types";

export class MemoryTripRepository implements TripRepository {
  readonly savedInputs: NewTrip[] = [];
  readonly deletedIds: string[] = [];

  constructor(
    private trips: SavedTrip[] = [],
    private readonly failureMessage: string | null = null,
  ) {}

  private fail(): void {
    if (this.failureMessage) throw new Error(this.failureMessage);
  }

  async listTrips(): Promise<SavedTrip[]> {
    this.fail();
    return [...this.trips];
  }

  async getTrip(id: string): Promise<SavedTrip | null> {
    this.fail();
    return this.trips.find((trip) => trip.id === id) ?? null;
  }

  async saveTrip(trip: NewTrip): Promise<SavedTrip> {
    this.fail();
    this.savedInputs.push(trip);
    const saved = {
      ...trip,
      id: `saved-${this.savedInputs.length}`,
      savedAt: "2026-08-22T12:00:00.000Z",
    };
    this.trips = [...this.trips, saved];
    return saved;
  }

  async deleteTrip(id: string): Promise<void> {
    this.fail();
    this.deletedIds.push(id);
    this.trips = this.trips.filter((trip) => trip.id !== id);
  }
}
```

Create `src/test/renderApp.tsx` with a `MemoryRouter`, `TripRepositoryProvider`, a caller-supplied initial route, and a caller-supplied repository:

```tsx
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import App from "../App";
import type { TripRepository } from "../history/TripRepository";
import { TripRepositoryProvider } from "../history/TripRepositoryContext";
import { completeWelcome } from "../welcome/welcomePreference";
import { MemoryTripRepository } from "./MemoryTripRepository";

export function renderApp({
  route = "/",
  repository = new MemoryTripRepository(),
  welcomeComplete = false,
}: {
  route?: string;
  repository?: TripRepository;
  welcomeComplete?: boolean;
} = {}) {
  if (welcomeComplete) completeWelcome();
  return render(
    <MemoryRouter initialEntries={[route]}>
      <TripRepositoryProvider repository={repository}>
        <App />
      </TripRepositoryProvider>
    </MemoryRouter>,
  );
}
```

- [ ] **Step 8: Run routing and existing calculator tests**

Run: `npm test -- src/App.routing.test.tsx src/App.receipt.test.tsx src/App.manual.test.tsx src/App.toggle.test.tsx`

Expected: all selected tests PASS.

- [ ] **Step 9: Commit routing and welcome**

```bash
git add package.json package-lock.json src
git commit -m "feat: add welcome and app navigation"
```

---

### Task 4: Receipt auto-save and manual explicit save

**Files:**
- Create: `src/history/tripMapping.ts`
- Create: `src/history/tripMapping.test.ts`
- Modify: `src/pages/HomePage.tsx`
- Modify: `src/components/ResultPanel.tsx`
- Create: `src/HomePage.history.test.tsx`
- Create: `src/test/renderHome.tsx`
- Modify: `src/App.receipt.test.tsx`
- Modify: `src/App.manual.test.tsx`

**Interfaces:**
- Consumes: `CarbonResult`, `TripRepository.saveTrip(NewTrip)`, and `useTripRepository()`.
- Produces: `toNewTrip(result: CarbonResult, source: TripSource): NewTrip`, receipt automatic save state, and manual **Save to history** state.

- [ ] **Step 1: Write failing mapping and Home save-flow tests**

In `tripMapping.test.ts`, assert that mapping copies the total and items but adds neither `id` nor `savedAt`. In `HomePage.history.test.tsx`, use a fake repository and cover:

```tsx
async function calculateReceipt(user: ReturnType<typeof userEvent.setup>) {
  await user.upload(
    screen.getByLabelText("Receipt image"),
    new File(["receipt"], "receipt.jpg", { type: "image/jpeg" }),
  );
  await user.click(screen.getByRole("button", { name: "Calculate receipt" }));
}

async function calculateOneManualItem(
  user: ReturnType<typeof userEvent.setup>,
) {
  await user.click(screen.getByRole("tab", { name: "Enter manually" }));
  await user.type(screen.getByLabelText("Product name"), "Granola bars");
  await user.type(screen.getByLabelText("Price (CAD)"), "5");
  await user.type(screen.getByLabelText("Quantity"), "1");
  await user.click(screen.getByRole("button", { name: "Add item" }));
  await user.click(
    screen.getByRole("button", { name: "Calculate manual groceries" }),
  );
}

it("automatically saves one receipt trip after calculation", async () => {
  const repository = new MemoryTripRepository();
  const user = userEvent.setup();
  renderHome({ repository });

  await calculateReceipt(user);
  await screen.findByText("6.4 kg CO₂e", {}, { timeout: 1_500 });

  expect(repository.savedInputs).toEqual([
    expect.objectContaining({ source: "receipt", totalCo2eKg: 6.4 }),
  ]);
});

it("requires one explicit save for a manual result", async () => {
  const repository = new MemoryTripRepository();
  const user = userEvent.setup();
  renderHome({ repository });
  await calculateOneManualItem(user);
  await screen.findByText("2.7 kg CO₂e", {}, { timeout: 1_500 });

  expect(repository.savedInputs).toHaveLength(0);
  await user.click(screen.getByRole("button", { name: "Save to history" }));
  expect(repository.savedInputs).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Saved" })).toBeDisabled();
});

it("keeps the result visible when automatic saving fails", async () => {
  const repository = new MemoryTripRepository(
    [],
    "Unable to save trip history.",
  );
  const user = userEvent.setup();
  renderHome({ repository });
  await calculateReceipt(user);

  expect(await screen.findByText("6.4 kg CO₂e", {}, { timeout: 1_500 }))
    .toBeInTheDocument();
  expect(await screen.findByText("Unable to save trip history."))
    .toBeInTheDocument();
});
```

Also test that a new manual calculation restores **Save to history** and that repeated clicks cannot create two inserts.

- [ ] **Step 2: Run the new tests and verify they fail**

Run: `npm test -- src/history/tripMapping.test.ts src/HomePage.history.test.tsx`

Expected: FAIL because mapping and save UI are absent.

- [ ] **Step 3: Implement the calculation-to-history mapper**

Create `src/history/tripMapping.ts`:

```ts
import type { CarbonResult } from "../types";
import type { NewTrip, TripSource } from "./types";

export function toNewTrip(
  result: CarbonResult,
  source: TripSource,
): NewTrip {
  return {
    source,
    totalCo2eKg: result.totalCo2eKg,
    items: result.items.map((item) => ({ ...item })),
  };
}
```

Create `src/test/renderHome.tsx` so Home-focused tests receive router and repository context without rendering the welcome gate:

```tsx
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { TripRepositoryProvider } from "../history/TripRepositoryContext";
import HomePage from "../pages/HomePage";
import type { TripRepository } from "../history/TripRepository";
import { MemoryTripRepository } from "./MemoryTripRepository";

export function renderHome({
  repository = new MemoryTripRepository(),
}: { repository?: TripRepository } = {}) {
  return render(
    <MemoryRouter>
      <TripRepositoryProvider repository={repository}>
        <HomePage />
      </TripRepositoryProvider>
    </MemoryRouter>,
  );
}
```

- [ ] **Step 4: Refactor Home request state to retain the result source**

Replace the generic `runRequest(request)` with `runRequest(source, request)`. After a successful request:

- Store `{ source, result }` as the active result.
- Clear the prior save warning and canonical saved-trip state.
- For `receipt`, immediately await `repository.saveTrip(toNewTrip(result, "receipt"))` and store the returned `SavedTrip`.
- For `manual`, wait for the explicit save handler.
- Catch repository errors separately from calculation errors so the result remains rendered.
- Disable manual save while the repository promise is pending and after a canonical trip is returned.

Pass the active `CarbonResult` to `ResultPanel`. Render the manual save action directly below the result when `source === "manual"`; render a receipt status message **Saved to history** after automatic persistence. Use an `aria-live="polite"` container for save status and `role="alert"` for save failure.

Update the existing receipt, manual, and toggle tests to call `renderHome()` instead of Testing Library's bare `render(<HomePage />)`, because Home now requires repository context.

- [ ] **Step 5: Run the save-flow and existing calculator tests**

Run: `npm test -- src/history/tripMapping.test.ts src/HomePage.history.test.tsx src/App.receipt.test.tsx src/App.manual.test.tsx src/App.toggle.test.tsx src/components/ResultPanel.test.tsx`

Expected: all selected tests PASS.

- [ ] **Step 6: Commit calculation persistence**

```bash
git add src
git commit -m "feat: save receipt and manual results"
```

---

### Task 5: Chronological History page

**Files:**
- Replace: `src/pages/HistoryPage.tsx`
- Create: `src/pages/HistoryPage.test.tsx`
- Create: `src/format.ts`
- Modify: `src/components/ResultPanel.tsx`

**Interfaces:**
- Consumes: `TripRepository.listTrips(): Promise<SavedTrip[]>` and React Router `Link`.
- Produces: loading, failure, empty, and newest-first History states with links to `/history/:id`.

- [ ] **Step 1: Write failing History page tests**

Create tests that render `/history` with a controlled repository:

```tsx
const olderTrip: SavedTrip = {
  id: "older",
  source: "manual",
  savedAt: "2026-07-20T12:00:00.000Z",
  totalCo2eKg: 2.7,
  items: [{ id: "apples", name: "Apples", co2eKg: 0.9 }],
};
const newerTrip: SavedTrip = {
  id: "newer",
  source: "receipt",
  savedAt: "2026-08-20T12:00:00.000Z",
  totalCo2eKg: 6.4,
  items: [{ id: "beef", name: "Ground beef", co2eKg: 3.1 }],
};

it("lists saved trips newest first without analytics or search", async () => {
  renderApp({
    route: "/history",
    repository: new MemoryTripRepository([olderTrip, newerTrip]),
    welcomeComplete: true,
  });

  const links = await screen.findAllByRole("link", { name: /trip/i });
  expect(links[0]).toHaveAttribute("href", `/history/${newerTrip.id}`);
  expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  expect(screen.queryByText(/previous month/i)).not.toBeInTheDocument();
});

it("explains how an empty history is populated", async () => {
  renderApp({ route: "/history", welcomeComplete: true });
  expect(await screen.findByText(/receipt calculations save automatically/i))
    .toBeInTheDocument();
  expect(screen.getByText(/manual calculations appear after you save them/i))
    .toBeInTheDocument();
});

it("shows a controlled load failure", async () => {
  renderApp({
    route: "/history",
    repository: new MemoryTripRepository(
      [],
      "Unable to access saved trip history.",
    ),
    welcomeComplete: true,
  });
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Unable to access saved trip history.",
  );
});
```

- [ ] **Step 2: Run the History tests and verify they fail**

Run: `npm test -- src/pages/HistoryPage.test.tsx`

Expected: FAIL because History does not load or render repository trips.

- [ ] **Step 3: Implement History loading and chronological rendering**

On mount, call `listTrips()`, guard against state updates after unmount, and sort a copy using `Date.parse(b.savedAt) - Date.parse(a.savedAt)`. Render:

- `<h1>History</h1>`.
- A polite loading status.
- A controlled alert on failure.
- The approved empty-state copy and a Home link.
- A semantic `<ol>` whose rows are full-card links to `/history/${trip.id}`.
- Source text **Receipt** or **Manual entry**, localized date/time, formatted total kg CO₂e, and singular/plural item count.

Create `src/format.ts` and move `ResultPanel` to the shared emissions formatter:

```ts
export function formatEmissions(value: number): string {
  return `${value.toLocaleString("en-CA", {
    maximumFractionDigits: 2,
  })} kg CO₂e`;
}

export function formatSavedAt(value: string): string {
  return new Date(value).toLocaleString("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
```

Use `formatSavedAt` and `formatEmissions` in each History row.

- [ ] **Step 4: Run History tests**

Run: `npm test -- src/pages/HistoryPage.test.tsx`

Expected: all History tests PASS.

- [ ] **Step 5: Commit History**

```bash
git add src/pages/HistoryPage.tsx src/pages/HistoryPage.test.tsx src/format.ts src/components/ResultPanel.tsx
git commit -m "feat: add chronological trip history"
```

---

### Task 6: Read-only Trip Details and confirmed deletion

**Files:**
- Create: `src/components/ConfirmDialog.tsx`
- Create: `src/components/ConfirmDialog.test.tsx`
- Replace: `src/pages/TripDetailsPage.tsx`
- Create: `src/pages/TripDetailsPage.test.tsx`

**Interfaces:**
- Consumes: route parameter `id`, `TripRepository.getTrip(id)`, `deleteTrip(id)`, and shared formatters.
- Produces: read-only trip view, accessible confirmation, deletion navigation, and missing/error recovery.

- [ ] **Step 1: Write failing confirmation and Trip Details tests**

Cover all behavior with these explicit assertions:

```tsx
const savedTrip: SavedTrip = {
  id: "receipt-trip",
  source: "receipt",
  savedAt: "2026-08-20T12:00:00.000Z",
  totalCo2eKg: 6.4,
  items: [{ id: "beef", name: "Ground beef", co2eKg: 3.1 }],
};

it("renders source, date, total, and every item without edit controls", async () => {
  renderApp({
    route: `/history/${savedTrip.id}`,
    repository: new MemoryTripRepository([savedTrip]),
    welcomeComplete: true,
  });
  expect(await screen.findByRole("heading", { name: "Trip details" }))
    .toBeInTheDocument();
  expect(screen.getByText("Ground beef")).toBeInTheDocument();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
});

it("cancels deletion without changing history", async () => {
  const user = userEvent.setup();
  const repository = new MemoryTripRepository([savedTrip]);
  renderApp({ route: `/history/${savedTrip.id}`, repository, welcomeComplete: true });
  const trigger = await screen.findByRole("button", { name: "Delete trip" });
  await user.click(trigger);
  expect(screen.getByRole("dialog", { name: "Delete this trip?" }))
    .toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Keep trip" }));
  expect(repository.deletedIds).toEqual([]);
  expect(trigger).toHaveFocus();
});

it("confirms deletion and returns to History", async () => {
  const user = userEvent.setup();
  const repository = new MemoryTripRepository([savedTrip]);
  renderApp({ route: `/history/${savedTrip.id}`, repository, welcomeComplete: true });
  await user.click(await screen.findByRole("button", { name: "Delete trip" }));
  await user.click(screen.getByRole("button", { name: "Delete permanently" }));
  expect(repository.deletedIds).toEqual([savedTrip.id]);
  expect(await screen.findByRole("heading", { name: "History" }))
    .toBeInTheDocument();
});
```

Also test a missing ID, repository load failure, delete failure, Escape cancellation, initial focus on **Keep trip**, and focus containment between the two dialog buttons.

- [ ] **Step 2: Run the detail tests and verify they fail**

Run: `npm test -- src/components/ConfirmDialog.test.tsx src/pages/TripDetailsPage.test.tsx`

Expected: FAIL because the dialog and detail behavior do not exist.

- [ ] **Step 3: Implement the accessible confirmation component**

`ConfirmDialog` accepts `open`, `title`, `description`, `confirmLabel`, `onConfirm`, and `onCancel`. When open it:

- Conditionally renders a fixed backdrop and `role="dialog" aria-modal="true"` panel.
- Focuses **Keep trip** on mount.
- Cancels on Escape.
- Handles Tab and Shift+Tab so focus stays between cancel and confirm.
- Restores focus to the previously focused trigger when closed.
- Uses a danger-styled confirm button and a neutral cancel button.

- [ ] **Step 4: Implement Trip Details states and deletion**

Read `id` with `useParams()`, call `getTrip(id)`, and render loading, repository error, or missing-trip recovery before the success state. The success state uses text and list elements only—no editable inputs. On confirmed delete:

1. Disable both dialog actions while deletion is pending.
2. Call `repository.deleteTrip(trip.id)`.
3. Navigate to `/history` with `{ replace: true }` after success.
4. Keep the trip visible and show a page-level alert after failure.

- [ ] **Step 5: Run confirmation and Trip Details tests**

Run: `npm test -- src/components/ConfirmDialog.test.tsx src/pages/TripDetailsPage.test.tsx`

Expected: all selected tests PASS.

- [ ] **Step 6: Commit Trip Details**

```bash
git add src/components/ConfirmDialog.tsx src/components/ConfirmDialog.test.tsx src/pages/TripDetailsPage.tsx src/pages/TripDetailsPage.test.tsx
git commit -m "feat: add read only trip details"
```

---

### Task 7: Progress chart and insight cards

**Files:**
- Create: `src/components/ProgressChart.tsx`
- Create: `src/components/ProgressChart.test.tsx`
- Replace: `src/pages/ProgressPage.tsx`
- Create: `src/pages/ProgressPage.test.tsx`

**Interfaces:**
- Consumes: `TripRepository.listTrips()` and `buildProgressSummary()` from Task 2.
- Produces: accessible six-month chart, comparison, average, highest-impact insight, and no-data/failure states.

- [ ] **Step 1: Write failing chart and Progress page tests**

Create component and page tests that assert:

```tsx
const progressTrips: SavedTrip[] = [
  {
    id: "july-a",
    source: "manual",
    savedAt: "2026-07-03T12:00:00",
    totalCo2eKg: 4,
    items: [],
  },
  {
    id: "july-b",
    source: "receipt",
    savedAt: "2026-07-20T12:00:00",
    totalCo2eKg: 6,
    items: [],
  },
  {
    id: "august",
    source: "receipt",
    savedAt: "2026-08-02T12:00:00",
    totalCo2eKg: 15,
    items: [],
  },
  {
    id: "march",
    source: "receipt",
    savedAt: "2026-03-10T12:00:00",
    totalCo2eKg: 2,
    items: [],
  },
];
const currentMonthTrip = progressTrips[2];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-22T12:00:00"));
});

afterEach(() => {
  vi.useRealTimers();
});

it("labels every monthly bar with its value", () => {
  render(
    <ProgressChart
      months={[
        { key: "2026-07", label: "Jul", totalCo2eKg: 10 },
        { key: "2026-08", label: "Aug", totalCo2eKg: 15 },
      ]}
    />,
  );
  expect(screen.getByRole("img", { name: "Monthly carbon footprint" }))
    .toBeInTheDocument();
  expect(screen.getByText("Jul")).toBeInTheDocument();
  expect(screen.getByText("10 kg CO₂e")).toBeInTheDocument();
  expect(screen.getByText("Aug")).toBeInTheDocument();
  expect(screen.getByText("15 kg CO₂e")).toBeInTheDocument();
});

it("shows six-month insights from saved trips", async () => {
  renderApp({
    route: "/progress",
    repository: new MemoryTripRepository(progressTrips),
    welcomeComplete: true,
  });
  expect(await screen.findByText("50% increase from last month"))
    .toBeInTheDocument();
  expect(screen.getByText("6.75 kg CO₂e per trip")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /highest-impact trip/i }))
    .toHaveAttribute("href", "/history/august");
});

it("does not invent a percentage when the previous month is zero", async () => {
  renderApp({
    route: "/progress",
    repository: new MemoryTripRepository([currentMonthTrip]),
    welcomeComplete: true,
  });
  expect(await screen.findByText("Not enough previous-month data to compare"))
    .toBeInTheDocument();
});
```

Also test the no-trips empty state and repository failure alert.

- [ ] **Step 2: Run Progress UI tests and verify they fail**

Run: `npm test -- src/components/ProgressChart.test.tsx src/pages/ProgressPage.test.tsx`

Expected: FAIL because chart and repository-backed Progress UI do not exist.

- [ ] **Step 3: Implement the dependency-free bar chart**

`ProgressChart` computes `max = Math.max(...totals, 1)` and renders a semantic figure with `role="img" aria-label="Monthly carbon footprint"`. Each bar receives `height: ${total / max * 100}%`, while visible month and emissions labels remain outside the bar so zero values are readable. Include a visually hidden sentence listing all month/value pairs for assistive technology.

- [ ] **Step 4: Implement Progress loading and insights**

Load trips once on mount, derive `buildProgressSummary(trips)`, then render:

- Approved empty state when `tripCount === 0`.
- `ProgressChart` when data exists.
- Signed percentage copy: **X% increase from last month**, **X% decrease from last month**, or **No change from last month**.
- **Not enough previous-month data to compare** when the comparison is `null`.
- Average formatted as **X kg CO₂e per trip**.
- Highest-impact card linked to `/history/:id`, including its date and total.
- Controlled loading status and repository failure alert.

Round display values to at most two decimal places while leaving the pure summary values unrounded.

- [ ] **Step 5: Run Progress tests**

Run: `npm test -- src/history/progress.test.ts src/components/ProgressChart.test.tsx src/pages/ProgressPage.test.tsx`

Expected: all selected tests PASS.

- [ ] **Step 6: Commit Progress & Insights**

```bash
git add src/history/progress.ts src/history/progress.test.ts src/components/ProgressChart.tsx src/components/ProgressChart.test.tsx src/pages/ProgressPage.tsx src/pages/ProgressPage.test.tsx
git commit -m "feat: add progress and carbon insights"
```

---

### Task 8: Responsive styling, accessibility integration, and full verification

**Files:**
- Modify: `src/styles.css`
- Modify: `README.md`
- Modify: tests identified by the full-suite run only when a changed public contract requires an assertion update.

**Interfaces:**
- Consumes: all page and component class names from Tasks 3–7.
- Produces: finished responsive presentation and documented local persistence behavior.

- [ ] **Step 1: Add responsive styles for the new application structure**

Extend `src/styles.css` with focused sections for:

- `.app-shell`, `.app-main`, `.app-nav`, and active navigation state.
- `.welcome-page` and `.welcome-card`.
- `.history-list`, `.history-card`, source badges, metadata, and empty/error states.
- `.trip-details`, `.trip-items`, and `.danger-button`.
- `.dialog-backdrop` and `.confirm-dialog` with clear destructive hierarchy.
- `.progress-grid`, `.progress-chart`, `.progress-bar`, `.progress-month`, and `.insight-card`.
- `.visually-hidden` utility for chart-equivalent text.

Keep existing color tokens and result/input styles. Add mobile bottom-navigation spacing so content is never hidden behind the nav. At wider breakpoints, move navigation into the header or a compact horizontal bar. Under `@media (prefers-reduced-motion: reduce)`, disable smooth scrolling and nonessential transitions.

- [ ] **Step 2: Document persistence and future backend replacement**

Add a concise README section stating:

- Receipt results are automatically saved in the current browser.
- Manual results require **Save to history**.
- History is local to the browser until backend history endpoints exist.
- The frontend persistence boundary is `TripRepository`; a future HTTP adapter replaces the local adapter without page changes.

- [ ] **Step 3: Run the complete automated suite**

Run: `npm test`

Expected: all test files and tests PASS with zero failures.

- [ ] **Step 4: Run the production build**

Run: `npm run build`

Expected: TypeScript compilation and Vite production build finish with exit code 0.

- [ ] **Step 5: Perform the required visual checks**

Run: `npm run dev -- --host 127.0.0.1`

Inspect at 320 × 700 and 1280 × 800:

- Welcome copy and **Start tracking**.
- Home calculator and save status/action.
- History empty and populated states.
- Trip Details and open confirmation dialog.
- Progress bars and insight cards.
- Active navigation, keyboard focus, long item names, and content clearance above mobile navigation.

Record any discovered visual defect as a failing component assertion when practical, fix it, then rerun `npm test` and `npm run build` before proceeding.

- [ ] **Step 6: Review the final diff against the approved specification**

Run:

```bash
git diff --check
git status --short
git diff --stat codex/frontend-backend-integration..HEAD
```

Check every specification section against the implemented route, repository, flow, state, accessibility, and test task. Confirm there is no search UI, saved-trip editing, chart dependency, or backend history implementation.

- [ ] **Step 7: Commit final presentation and documentation**

```bash
git add README.md src
git commit -m "feat: finish responsive history experience"
```

- [ ] **Step 8: Re-run final verification after the commit**

Run:

```bash
npm test
npm run build
git status --short --branch
```

Expected: all tests PASS, the build exits 0, and the branch has no uncommitted changes.
