# Frontend–Backend Integration Design

**Date:** 2026-08-22  
**Status:** Approved  
**Scope:** Connect the existing GreenerCart React frontend to the existing EcoReceipt FastAPI backend without changing the carbon-calculation pipeline

## Goal

Make receipt uploads and manual grocery calculations work in frontend live mode while preserving mock mode and isolating all compatibility logic at the frontend API boundary.

## Architecture

The frontend API module will adapt the frontend's existing models to the backend's existing routes and response schema. The FastAPI application, `CarbonEngine`, OCR, matching, fallback estimation, calculation code, emissions dataset, React form state, and result components will remain unchanged.

This approach has the smallest blast radius: only the transport and validation boundary changes, while both user interfaces continue consuming the existing `CarbonResult` model.

## Receipt Request

In live mode, `analyzeReceipt(file)` will:

1. Create a `FormData` body.
2. Append the image using the backend field name `file`.
3. Send `POST /api/receipts/scan` to `VITE_API_BASE_URL`.
4. Convert the successful backend result into the frontend `CarbonResult` model.

Mock mode will continue calling the deterministic `mockAnalyzeReceipt` function and will never send an HTTP request.

## Manual Request

In live mode, `calculateManual(items)` will convert each frontend grocery item as follows:

```ts
{
  raw_item: item.name,
  qty: item.quantity,
}
```

It will send the translated list as:

```json
{
  "items": [
    {
      "raw_item": "Apples",
      "qty": 2
    }
  ]
}
```

The request target will be `POST /api/receipts/analyze`. The frontend-only fields `id`, `type`, and `priceCad` will not be sent because the current carbon engine calculates emissions from item identity and quantity, not price.

Mock mode will continue calling `mockCalculateManual` with the original frontend items.

## Response Normalization

Both live operations receive the backend's native result:

```json
{
  "summary": {
    "total_co2e_kg": 1.25,
    "total_items_processed": 1,
    "potential_total_savings_kg": 0.4
  },
  "line_items": [
    {
      "raw_item": "Apples",
      "matched_item": "Apple",
      "item_co2e_kg": 1.25
    }
  ],
  "eco_swap_recommendations": []
}
```

The frontend adapter will validate and normalize only the fields required by `CarbonResult`:

```ts
{
  totalCo2eKg: response.summary.total_co2e_kg,
  items: response.line_items.map((item, index) => ({
    id: `item-${index}`,
    name: item.matched_item || item.raw_item,
    co2eKg: item.item_co2e_kg,
  })),
}
```

The adapter will require a finite, non-negative total and a valid line-item array. Every item must have a finite, non-negative `item_co2e_kg` and at least one non-empty name from `matched_item` or `raw_item`. Invalid responses will produce the existing invalid-response error instead of rendering partial data.

Non-success HTTP responses will continue using the backend's `detail`, `error`, or `message` field when available. Live failures will never fall back to mock results.

## Image Compatibility

The backend currently accepts JPEG, PNG, and WebP. The frontend will temporarily remove HEIC and HEIF from its file picker, validation allowlist, and help text so it cannot submit a format the backend rejects.

The existing 10 MB frontend and backend size limit will remain unchanged.

## Configuration

The frontend's default API base URL and `.env.example` value will be:

```env
VITE_API_BASE_URL=http://localhost:8000
```

Mock mode remains the default when `VITE_API_MODE` is unset. Live development requires:

```env
VITE_API_MODE=live
VITE_API_BASE_URL=http://localhost:8000
```

The existing permissive hackathon CORS configuration already allows the Vite development origin.

## Files in Scope

- `src/api.ts`: request translation, routes, response validation, and normalization.
- `src/api.test.ts`: live request and response contract tests.
- `src/validation.ts`: remove unsupported HEIC and HEIF MIME types.
- `src/validation.test.ts`: verify the backend-compatible image allowlist.
- `src/components/ReceiptInput.tsx`: align the file picker and help text with supported formats.
- `.env.example`: use FastAPI's port 8000.
- `README.md`: document the live frontend/backend startup sequence.

## Files Explicitly Out of Scope

- `main.py`
- `engine.py`
- `calculator.py`
- `matcher.py`
- `ocr.py`
- `api_client.py`
- `fallback.py`
- `emission_factors.csv`
- `src/App.tsx`
- `src/components/ResultPanel.tsx`
- `src/components/ManualEntryForm.tsx`
- `src/mockApi.ts`

## Error Handling

- A backend non-2xx response is shown through the existing shared error panel.
- A malformed success response becomes `The calculation service returned an invalid response.`
- A network failure remains `Unable to calculate your groceries right now.`
- Receipt and manual inputs remain available for retry through the existing application state.
- No live failure returns mock data.

## Testing and Verification

Implementation will follow test-driven development:

1. Add failing tests for the receipt route and `file` multipart field.
2. Add failing tests for manual request translation and route selection.
3. Add tests for backend-response normalization and malformed responses.
4. Update image-validation tests for JPEG, PNG, and WebP acceptance and HEIC/HEIF rejection.
5. Implement the minimum adapter and validation changes required to pass those tests.
6. Run the complete frontend test suite.
7. Run the TypeScript production build.
8. Start FastAPI on port 8000 and verify a live manual calculation.
9. With a locally configured `GEMINI_API_KEY`, verify a live receipt scan. Without the key, verify that the backend's expected 503 response is displayed correctly.

## Success Criteria

- Live receipt requests use `/api/receipts/scan` with multipart field `file`.
- Live manual requests use `/api/receipts/analyze` with `{ raw_item, qty }` items.
- Both backend response types render through the existing result panel after normalization.
- Invalid backend responses and non-2xx responses produce clear errors.
- Mock mode behaves exactly as before.
- The frontend only accepts image formats supported by the backend.
- The full frontend test suite and production build pass.
- No backend calculation or OCR files change.
