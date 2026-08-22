# GreenerCart Welcome, History, and Progress Design

**Date:** 2026-08-22

**Status:** Approved for implementation planning

**Scope:** Frontend welcome, saved-trip history, trip details, and progress insights

## 1. Goal

Extend the existing GreenerCart frontend with four connected capabilities:

1. A one-time welcome page.
2. A plain, searchable-history-style list of saved calculations.
3. Read-only details and deletion for a saved trip.
4. Progress and insights derived from saved carbon results over time.

The existing receipt and manual calculator remains the Home page. The current frontend-to-backend calculation integration remains unchanged. This work is frontend-only; saved trips use browser storage until the backend team provides history endpoints.

## 2. Product Decisions

- A successful receipt calculation is saved to history automatically.
- A successful manual calculation is saved only after the user selects **Save to history**.
- Saved trips can be deleted after confirmation but cannot be edited.
- Welcome appears once per browser profile and then redirects returning users to Home.
- History is strictly a newest-first list of saved trips. Analytics belong only on Progress & Insights.
- Progress initially covers the current calendar month and five previous calendar months.
- Browser persistence is hidden behind a replaceable repository interface so a future backend adapter does not require page rewrites.

## 3. Routes and Navigation

React Router provides these routes:

- `/welcome` — one-time onboarding page.
- `/` — the existing receipt and manual calculator.
- `/history` — saved-trip history.
- `/history/:id` — read-only saved-trip details.
- `/progress` — six-month progress and insights.
- `*` — unknown-route recovery with a path back Home.

The welcome route sits outside the shared application shell. All other product routes use an application shell with navigation for **Home**, **History**, and **Progress & Insights**. The navigation is thumb-friendly at mobile widths and compact at wider widths.

On application startup, a user without a valid welcome-complete flag is redirected to `/welcome`. Selecting **Start tracking** persists the flag and navigates to `/`. A user who has completed welcome can still reach Home directly and is not repeatedly interrupted.

## 4. Saved-Trip Model

The frontend adds a normalized persisted model independent of the calculation transport model:

```ts
type TripSource = "receipt" | "manual";

interface SavedTripItem {
  id: string;
  name: string;
  co2eKg: number;
}

interface SavedTrip {
  id: string;
  source: TripSource;
  savedAt: string;
  totalCo2eKg: number;
  items: SavedTripItem[];
}
```

`savedAt` is an ISO 8601 timestamp. IDs are generated in the frontend for the local implementation. Calculation responses are mapped into this model at the save boundary rather than expanding the existing backend response contract.

## 5. Persistence Boundary

Pages and calculation flows use an asynchronous repository contract:

```ts
interface TripRepository {
  listTrips(): Promise<SavedTrip[]>;
  getTrip(id: string): Promise<SavedTrip | null>;
  saveTrip(trip: SavedTrip): Promise<void>;
  deleteTrip(id: string): Promise<void>;
}
```

The initial `LocalStorageTripRepository` stores a versioned envelope in `localStorage`. Reads validate the envelope and every trip before returning data. Malformed or incompatible stored content produces a controlled repository error and never crashes a page.

A small repository factory supplies the active implementation. A future `HttpTripRepository` can implement the same operations and map the backend contract to `SavedTrip`. Page components, chart calculations, and navigation must not import or call `localStorage` directly.

The welcome-complete flag is a separate small browser preference because it is not saved-trip domain data.

## 6. Calculation and Save Flows

### Receipt

1. The existing receipt request runs through the current API module.
2. On success, the result is displayed.
3. The result is converted to a receipt `SavedTrip` and automatically persisted once.
4. The same rendered result cannot be inserted twice by rerendering or retry-state transitions.
5. If persistence fails, the calculation remains visible and the page displays a specific history-save warning.

A newly submitted receipt is a new calculation and therefore a new trip. This scope does not attempt image-content deduplication across separate submissions.

### Manual

1. The existing manual request runs through the current API module.
2. On success, the result is displayed with **Save to history**.
3. Selecting the action converts the result to a manual `SavedTrip` and persists it once.
4. The action becomes a disabled **Saved** state after success.
5. A new manual calculation resets the saved state.
6. A failed save leaves the action available and displays a specific error.

Manual results that are never explicitly saved do not appear in History or Progress.

## 7. Page Design

### Welcome

Welcome briefly explains that GreenerCart can analyze a receipt or accept manual groceries, shows carbon results for the trip and individual items, stores progress in the current browser for now, and requires no account. **Start tracking** completes onboarding and opens Home.

### History

History contains no charts or aggregate summary. It shows saved trips newest first. Each row displays:

- Receipt or manual source label.
- Saved date and time.
- Total kg CO2e.
- Item count.

Selecting a row navigates to its detail route. The empty state explains that receipt calculations save automatically while manual calculations require **Save to history**, and links back Home.

### Trip Details

Trip details are read-only and show:

- Source.
- Saved date and time.
- Total kg CO2e.
- Every saved item and its kg CO2e.

There are no editing controls. **Delete trip** opens an accessible confirmation dialog. Confirming deletes through the repository and returns to History. Cancelling leaves the trip unchanged. A missing or already deleted ID shows a recovery state with a link to History.

### Progress & Insights

Progress loads the same saved-trip collection and derives:

- One total for each of six calendar months, from oldest to current.
- Current-month percentage change from the previous month when the previous value is greater than zero.
- Average saved-trip footprint across trips in the six-month window.
- Highest-impact trip in the six-month window.

The chart is a lightweight in-app bar chart without a chart-library dependency. Every bar has a visible month label and formatted value, and equivalent text is exposed to assistive technology.

When the previous month is zero, the UI reports that a percentage comparison is not yet available. When there are no trips in the six-month window, the page uses a constructive empty state rather than displaying performance claims. Months without trips remain present with a zero value so the time range is stable and understandable.

## 8. Derived Data Rules

- Month membership is based on the user's local calendar month derived from `savedAt`.
- The six-month window includes the current month and five immediately preceding months.
- Monthly total is the sum of `totalCo2eKg` for trips in that month.
- Percentage change is `(current - previous) / previous * 100` and is omitted when the previous total is zero.
- Average trip footprint is the six-month total divided by the number of trips in the window.
- Highest-impact trip is the trip with the largest `totalCo2eKg`; equal values resolve to the most recently saved trip.
- Deletion immediately removes a trip from all derived results on the next repository read.
- Display values are rounded for readability; calculations use unrounded stored numbers.

## 9. States, Errors, and Accessibility

Each repository-backed page supports loading, success, empty, and failure states. Errors distinguish calculation failures from history persistence failures. The existing result remains visible if saving fails.

The confirmation dialog uses an accessible name, traps or appropriately manages focus while open, supports Escape/cancel behavior, and returns focus to the delete trigger after cancellation. Route changes move focus to the new page's primary heading. Active navigation is conveyed by more than color.

All new controls use semantic elements, visible focus styles, sufficient contrast, and touch-friendly target sizes. Reduced-motion preferences are respected. The existing clean GreenerCart typography, neutral surfaces, restrained green accent, and constructive language remain the visual foundation.

## 10. Component Boundaries

Expected responsibilities are:

- Router and welcome gate: route selection and first-launch redirects.
- Application shell: shared brand and navigation.
- Home page: existing calculator behavior plus receipt/manual save orchestration.
- Trip repository: persistence implementation and validation.
- History page: trip loading and chronological list rendering.
- Trip details page: trip loading, read-only display, and delete coordination.
- Progress page: trip loading and presentation of derived metrics.
- Progress calculations: pure functions for month buckets and insights.
- Shared repository state utilities: consistent loading and error behavior without coupling pages to storage.

Pure calculations and storage validation remain separate from React components so they can be tested without rendering the application.

## 11. Testing and Verification

Automated coverage must include:

- Welcome is shown before completion and skipped after completion.
- **Start tracking** persists completion and opens Home.
- Successful receipt calculation saves one trip automatically.
- Receipt rerenders and retry-state transitions do not duplicate the same result.
- Successful manual calculation does not save until requested.
- Manual save changes to **Saved** and cannot insert twice.
- A new manual calculation resets the saved state.
- History orders trips newest first and renders its empty state.
- Trip details are read-only.
- Delete cancellation preserves a trip; confirmation deletes it and returns to History.
- Missing trip IDs render recovery UI.
- Six-month buckets, percentage change, average, highest trip, zero previous month, and no-data cases are correct.
- Versioned storage validates reads and reports malformed data safely.
- Repository failures produce the correct page or save error without hiding calculation results.
- Existing receipt, manual, validation, API, and result tests continue to pass.
- The production TypeScript and Vite build succeeds.

Manual visual checks cover at least one mobile width and one desktop width for Welcome, Home navigation, History, Trip Details, the delete dialog, and Progress & Insights.

## 12. Deferred Work

- Backend history endpoints and `HttpTripRepository` implementation.
- Accounts, authentication, and cross-device synchronization.
- Editing saved trips.
- Receipt image-content deduplication across separate submissions.
- Custom date ranges, filtering, search controls, goals, streaks, or achievements.
- Additional insight categories or backend-generated recommendations.
- Exporting, sharing, or downloading history.

## 13. Success Criteria

This feature is complete when:

- First-time users see Welcome once and returning users reach Home.
- Existing receipt and manual calculations still work with the connected backend and mock mode.
- Receipt results save automatically and manual results save explicitly.
- Users can browse a newest-first history, open read-only details, and delete with confirmation.
- Progress accurately presents six monthly totals and the approved insight metrics.
- Storage is versioned, validated, and isolated behind the replaceable repository interface.
- The experience is responsive and accessible at the agreed verification level.
- All existing and new automated tests pass and the production build succeeds.
