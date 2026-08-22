# Eco-Swap Backend Design

**Date:** 2026-08-22

## Goal

Make eco-swap recommendations correct after all emission providers have run and preserve those recommendations in saved trips so the existing frontend can later display them immediately and derive Progress & Insights data.

## Scope

This backend phase covers recommendation calculation, calculation-response stability, saved-trip API validation, SQLite persistence, browser-history import compatibility at the HTTP boundary, and backend tests. It does not change React types, parsing, browser storage, result components, or the existing Progress & Insights page.

## Calculation contract

The receipt calculation endpoints keep their existing response shape:

```json
{
  "summary": {
    "total_co2e_kg": 25.2,
    "total_items_processed": 2,
    "potential_total_savings_kg": 23.49
  },
  "line_items": [],
  "eco_swap_recommendations": [
    {
      "original_item": "Ground Beef",
      "original_co2e_kg": 24.3,
      "recommended_swap": "Lentils",
      "swap_co2e_kg": 0.81,
      "potential_savings_kg": 23.49
    }
  ]
}
```

Local matching continues to determine whether an item has a configured eco-swap. After Climatiq, the local dataset, or the Claude/default fallback establishes each line item's final emissions, the engine rebuilds recommendations. The final original emission value is used for `original_co2e_kg`; the configured replacement remains an estimate derived from its local emission factor, default unit weight, and the purchased quantity. Recommendations with non-positive savings are omitted, results are sorted by descending savings, and the summary total equals the rounded sum of returned savings.

No new calculation endpoint is introduced.

## Saved-trip contract

Saved trips gain an ordered `ecoSwapRecommendations` array using the frontend-facing camelCase convention already used by trip payloads:

```json
{
  "source": "receipt",
  "totalCo2eKg": 25.2,
  "items": [],
  "ecoSwapRecommendations": [
    {
      "originalItem": "Ground Beef",
      "originalCo2eKg": 24.3,
      "recommendedSwap": "Lentils",
      "swapCo2eKg": 0.81,
      "potentialSavingsKg": 23.49
    }
  ]
}
```

Names must be non-empty, emission values must be finite and non-negative, potential savings must be positive, and each recommendation must describe a lower-emission replacement. The field defaults to an empty list so old browser trips and clients remain valid.

The backend does not persist `potentialTotalSavingsKg`; consumers derive it from the recommendation list to prevent duplicated totals from drifting.

## Persistence

SQLite gains a `trip_recommendations` child table with a foreign key to `trips`, a stable `position`, the five recommendation values, and uniqueness on `(trip_id, position)`. `CREATE TABLE IF NOT EXISTS` upgrades existing databases without altering or rebuilding existing tables. Existing trips hydrate with an empty recommendation array. Deleting a trip cascades to its recommendations.

Create, list, get, import, alias lookup, and conflict detection all include recommendations. An imported legacy trip without the field is normalized to an empty list by Pydantic before reaching the store.

## Compatibility and constraints

- Support the repository's currently available Python 3.9 test runtime by postponing annotation evaluation in `main.py`.
- Do not call Climatiq or Claude from unit tests; use deterministic fakes.
- Do not add a Progress endpoint. Progress remains derived from saved trips by the frontend.
- Do not change the Streamlit or React interfaces in this backend phase.
- Do not modify or commit `.env.save`.

## Verification

Backend tests must cover local recommendations, a Climatiq override, removal of non-beneficial swaps, descending ordering, exact summary totals, saved-trip CRUD, legacy empty defaults, import idempotency/conflicts, persistence across store restarts, and delete cascades. The final backend gate is `.venv/bin/python -m pytest tests -v`.
