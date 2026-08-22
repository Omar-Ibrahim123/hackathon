# Frontend–Backend Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the GreenerCart React frontend's receipt and manual-entry flows to the existing EcoReceipt FastAPI endpoints in live mode.

**Architecture:** Keep the backend and React components unchanged. Translate frontend requests and normalize backend responses in `src/api.ts`, align receipt validation with the backend's accepted MIME types, and preserve deterministic mock mode as a separate path.

**Tech Stack:** React 19, TypeScript 7, Vite 8, Vitest 4, FastAPI, Python 3

**Spec:** `docs/superpowers/specs/2026-08-22-frontend-backend-integration-design.md`

## Global Constraints

- Do not modify `main.py`, `engine.py`, `calculator.py`, `matcher.py`, `ocr.py`, `api_client.py`, `fallback.py`, or `emission_factors.csv`.
- Do not modify `src/App.tsx`, `src/components/ResultPanel.tsx`, `src/components/ManualEntryForm.tsx`, or `src/mockApi.ts`.
- Live receipt requests must use `POST /api/receipts/scan` with multipart field `file`.
- Live manual requests must use `POST /api/receipts/analyze` with `{ raw_item, qty }` items.
- Live failures must never fall back to mock data.
- Mock mode must remain the default when `VITE_API_MODE` is unset.
- Frontend receipt formats must be limited to JPEG, PNG, and WebP with the existing 10 MB size limit.
- The default live backend origin is `http://localhost:8000`.
- Add no runtime or development dependencies.

---

## File Structure

- `src/api.ts` remains the only transport and response-normalization boundary.
- `src/api.test.ts` owns request-contract, response-normalization, network-failure, and mock-separation coverage.
- `src/validation.ts` owns accepted receipt MIME types and validation copy.
- `src/validation.test.ts` owns format-compatibility coverage.
- `src/components/ReceiptInput.tsx` only reflects the validation contract in its picker and help text.
- `.env.example` and `README.md` document local live-mode configuration without containing secrets.

---

### Task 1: Adapt Live Requests and Backend Responses

**Files:**
- Modify: `src/api.test.ts`
- Modify: `src/api.ts`

**Interfaces:**
- Consumes: existing `CarbonResult`, `ManualGroceryItem`, `mockAnalyzeReceipt`, and `mockCalculateManual`.
- Produces: `analyzeReceipt(file: File): Promise<CarbonResult>`, `calculateManual(items: ManualGroceryItem[]): Promise<CarbonResult>`, and `parseCarbonResult(value: unknown): CarbonResult` using the backend-native response schema.

- [ ] **Step 1: Replace the live API tests with backend-contract expectations**

Keep the existing default-mock test. Replace the live receipt and manual tests, then add malformed-response and network-failure coverage using these test bodies:

```ts
it("posts a receipt to the FastAPI scan endpoint and normalizes its response", async () => {
  vi.stubEnv("VITE_API_MODE", "live");
  vi.stubEnv("VITE_API_BASE_URL", "https://api.example.test");
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        summary: {
          total_co2e_kg: 2.4,
          total_items_processed: 1,
          potential_total_savings_kg: 0,
        },
        line_items: [
          {
            raw_item: "OATLY BARISTA OAT MILK",
            matched_item: "Oat milk",
            item_co2e_kg: 2.4,
          },
        ],
        eco_swap_recommendations: [],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  const { analyzeReceipt } = await import("./api");
  const file = new File(["receipt"], "receipt.jpg", { type: "image/jpeg" });

  await expect(analyzeReceipt(file)).resolves.toEqual({
    totalCo2eKg: 2.4,
    items: [{ id: "item-0", name: "Oat milk", co2eKg: 2.4 }],
  });

  expect(fetchMock).toHaveBeenCalledOnce();
  expect(fetchMock.mock.calls[0]?.[0]).toBe(
    "https://api.example.test/api/receipts/scan",
  );
  const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
  expect(request.method).toBe("POST");
  expect(request.body).toBeInstanceOf(FormData);
  expect((request.body as FormData).get("file")).toBe(file);
  expect((request.body as FormData).get("receipt")).toBeNull();
});

it("surfaces a live receipt failure without returning mock data", async () => {
  vi.stubEnv("VITE_API_MODE", "live");
  vi.stubEnv("VITE_API_BASE_URL", "https://api.example.test");
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ detail: "Receipt service unavailable." }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const { analyzeReceipt } = await import("./api");

  await expect(
    analyzeReceipt(
      new File(["receipt"], "receipt.jpg", { type: "image/jpeg" }),
    ),
  ).rejects.toThrow("Receipt service unavailable.");

  expect(fetchMock.mock.calls[0]?.[0]).toBe(
    "https://api.example.test/api/receipts/scan",
  );
});

it("translates manual groceries for the FastAPI analyze endpoint", async () => {
  vi.stubEnv("VITE_API_MODE", "live");
  vi.stubEnv("VITE_API_BASE_URL", "https://api.example.test");
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        summary: {
          total_co2e_kg: 0.9,
          total_items_processed: 1,
          potential_total_savings_kg: 0,
        },
        line_items: [
          {
            raw_item: "Apples",
            matched_item: "Apple",
            item_co2e_kg: 0.9,
          },
        ],
        eco_swap_recommendations: [],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  const { calculateManual } = await import("./api");

  await expect(
    calculateManual([
      {
        id: "apples",
        type: "product",
        name: "Apples",
        priceCad: 4.5,
        quantity: 2,
      },
    ]),
  ).resolves.toEqual({
    totalCo2eKg: 0.9,
    items: [{ id: "item-0", name: "Apple", co2eKg: 0.9 }],
  });

  expect(fetchMock.mock.calls[0]?.[0]).toBe(
    "https://api.example.test/api/receipts/analyze",
  );
  const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
  expect(request.headers).toEqual({ "Content-Type": "application/json" });
  expect(JSON.parse(request.body as string)).toEqual({
    items: [{ raw_item: "Apples", qty: 2 }],
  });
});

it.each([
  { summary: {}, line_items: [] },
  { summary: { total_co2e_kg: -1 }, line_items: [] },
  {
    summary: { total_co2e_kg: 1 },
    line_items: [{ raw_item: "Apples", item_co2e_kg: Number.NaN }],
  },
])("rejects malformed backend results", async (payload) => {
  vi.stubEnv("VITE_API_MODE", "live");
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const { calculateManual } = await import("./api");

  await expect(
    calculateManual([
      {
        id: "apples",
        type: "product",
        name: "Apples",
        priceCad: 4.5,
        quantity: 1,
      },
    ]),
  ).rejects.toThrow("The calculation service returned an invalid response.");
});

it("converts a rejected fetch into the shared request failure", async () => {
  vi.stubEnv("VITE_API_MODE", "live");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
  const { calculateManual } = await import("./api");

  await expect(
    calculateManual([
      {
        id: "apples",
        type: "product",
        name: "Apples",
        priceCad: 4.5,
        quantity: 1,
      },
    ]),
  ).rejects.toThrow("Unable to calculate your groceries right now.");
});
```

- [ ] **Step 2: Run the focused API tests and verify the contract failures**

Run:

```bash
npm test -- src/api.test.ts
```

Expected: FAIL because the current code uses `/api/receipts/analyze` with field `receipt`, calls the nonexistent `/api/groceries/calculate`, expects the frontend-native response shape, and exposes raw network errors.

- [ ] **Step 3: Implement backend response guards and normalization in `src/api.ts`**

Remove the unused `ManualCalculationRequest` import. Keep `CarbonResultItem` for the normalized result guard, and replace the existing response parser with:

```ts
function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function normalizeLineItem(
  value: unknown,
  index: number,
): CarbonResultItem | null {
  if (typeof value !== "object" || value === null) return null;
  const item = value as Record<string, unknown>;
  const name = isNonEmptyString(item.matched_item)
    ? item.matched_item.trim()
    : isNonEmptyString(item.raw_item)
      ? item.raw_item.trim()
      : null;

  if (!name || !isNonNegativeFiniteNumber(item.item_co2e_kg)) return null;

  return {
    id: `item-${index}`,
    name,
    co2eKg: item.item_co2e_kg,
  };
}

export function parseCarbonResult(value: unknown): CarbonResult {
  if (typeof value !== "object" || value === null) {
    throw new Error(INVALID_RESPONSE_MESSAGE);
  }

  const response = value as Record<string, unknown>;
  if (typeof response.summary !== "object" || response.summary === null) {
    throw new Error(INVALID_RESPONSE_MESSAGE);
  }

  const summary = response.summary as Record<string, unknown>;
  if (
    !isNonNegativeFiniteNumber(summary.total_co2e_kg) ||
    !Array.isArray(response.line_items)
  ) {
    throw new Error(INVALID_RESPONSE_MESSAGE);
  }

  const items = response.line_items.map(normalizeLineItem);
  if (items.some((item) => item === null)) {
    throw new Error(INVALID_RESPONSE_MESSAGE);
  }

  return {
    totalCo2eKg: summary.total_co2e_kg,
    items: items as CarbonResultItem[],
  };
}
```

- [ ] **Step 4: Add a fetch wrapper that distinguishes network failures from HTTP and schema failures**

Add this helper below `readResult`:

```ts
async function fetchResult(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<CarbonResult> {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch {
    throw new Error(REQUEST_FAILURE_MESSAGE);
  }
  return readResult(response);
}
```

This catches only failures from obtaining the HTTP response. `readResult` remains responsible for backend error messages and invalid success bodies.

- [ ] **Step 5: Implement the receipt and manual request translations**

Change the default base URL and both live operations to:

```ts
const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000")
  .replace(/\/$/, "");

export async function analyzeReceipt(file: File): Promise<CarbonResult> {
  if (mode === "mock") return mockAnalyzeReceipt(file);

  const body = new FormData();
  body.append("file", file);
  return fetchResult(`${baseUrl}/api/receipts/scan`, {
    method: "POST",
    body,
  });
}

export async function calculateManual(
  items: ManualGroceryItem[],
): Promise<CarbonResult> {
  if (mode === "mock") return mockCalculateManual(items);

  const body = {
    items: items.map((item) => ({
      raw_item: item.name,
      qty: item.quantity,
    })),
  };
  return fetchResult(`${baseUrl}/api/receipts/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
```

- [ ] **Step 6: Run the focused API tests**

Run:

```bash
npm test -- src/api.test.ts
```

Expected: all `src/api.test.ts` tests PASS.

- [ ] **Step 7: Commit the API adapter**

```bash
git add src/api.ts src/api.test.ts
git commit -m "feat: connect frontend API to FastAPI"
```

---

### Task 2: Align Receipt Formats With the Backend

**Files:**
- Modify: `src/validation.test.ts`
- Modify: `src/validation.ts`
- Modify: `src/components/ReceiptInput.tsx`

**Interfaces:**
- Consumes: `validateReceiptFile(file: File)` from `src/validation.ts`.
- Produces: one consistent JPEG/PNG/WebP allowlist shared behavior across validation, the file picker, and user-facing copy.

- [ ] **Step 1: Write failing receipt-format tests**

Replace the two receipt validation tests with:

```ts
it.each([
  ["receipt.jpg", "image/jpeg"],
  ["receipt.png", "image/png"],
  ["receipt.webp", "image/webp"],
])("accepts backend-supported receipt image %s", (name, type) => {
  expect(validateReceiptFile(new File(["x"], name, { type }))).toEqual({
    ok: true,
  });
});

it.each([
  ["receipt.heic", "image/heic"],
  ["receipt.heif", "image/heif"],
  ["receipt.pdf", "application/pdf"],
])("rejects backend-unsupported receipt file %s", (name, type) => {
  expect(validateReceiptFile(new File(["x"], name, { type }))).toEqual({
    ok: false,
    message: "Choose a JPG, PNG, or WebP image.",
  });
});
```

Keep the existing manual-item tests unchanged.

- [ ] **Step 2: Run validation tests and verify HEIC/HEIF currently fail the new contract**

Run:

```bash
npm test -- src/validation.test.ts
```

Expected: FAIL because HEIC and HEIF are currently accepted and the error copy still names HEIC.

- [ ] **Step 3: Restrict validation to the backend-supported MIME types**

Change the receipt constants and error copy in `src/validation.ts` to:

```ts
const ACCEPTED_RECEIPT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

// Inside validateReceiptFile:
message: "Choose a JPG, PNG, or WebP image.",
```

Leave `MAX_RECEIPT_BYTES` at `10 * 1024 * 1024`.

- [ ] **Step 4: Align the receipt picker and help text**

In `src/components/ReceiptInput.tsx`, replace the help text and `accept` value with:

```tsx
<span className="upload-hint">
  Keep the full receipt visible · JPG, PNG or WebP · 10 MB max
</span>
<input
  aria-label="Receipt image"
  type="file"
  accept="image/jpeg,image/png,image/webp"
  capture="environment"
  disabled={disabled}
  onChange={handleFileChange}
/>
```

- [ ] **Step 5: Run focused validation and receipt component tests**

Run:

```bash
npm test -- src/validation.test.ts src/App.receipt.test.tsx
```

Expected: all selected tests PASS.

- [ ] **Step 6: Commit the format alignment**

```bash
git add src/validation.ts src/validation.test.ts src/components/ReceiptInput.tsx
git commit -m "fix: align receipt formats with backend"
```

---

### Task 3: Document Live Configuration and Verify the Complete Integration

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Verify: all files changed by Tasks 1–2

**Interfaces:**
- Consumes: FastAPI on `http://localhost:8000` and Vite's `VITE_API_MODE`/`VITE_API_BASE_URL` variables.
- Produces: a reproducible local startup sequence for mock mode and live mode.

- [ ] **Step 1: Update the example frontend API origin**

Change the final environment lines in `.env.example` to:

```env
# Frontend demo mode. Switch to live to call the local FastAPI backend.
VITE_API_MODE=mock
VITE_API_BASE_URL=http://localhost:8000
```

Do not put real API keys in `.env.example` or any tracked file.

- [ ] **Step 2: Replace the frontend run section with exact mock and live instructions**

Use this content in `README.md`:

````markdown
## Run the Frontend

Install frontend dependencies:

```bash
npm install
```

Mock mode is the default and does not require the backend:

```bash
npm run dev
```

For live mode, start FastAPI in one terminal:

```bash
source .venv/bin/activate
uvicorn main:app --reload --port 8000
```

Then start Vite in another terminal with the live API settings:

```bash
VITE_API_MODE=live VITE_API_BASE_URL=http://localhost:8000 npm run dev
```

Manual grocery calculations work without external API keys for locally matched items. Receipt photo scanning requires `GEMINI_API_KEY`; without it, the API returns a service-unavailable error that the frontend displays without substituting mock data.
````

- [ ] **Step 3: Run the complete frontend test suite**

Run:

```bash
npm test
```

Expected: 6 test files and all tests PASS.

- [ ] **Step 4: Run the production build**

Run:

```bash
npm run build
```

Expected: TypeScript compilation and Vite production build both succeed.

- [ ] **Step 5: Confirm only approved files changed**

Run:

```bash
git status --short
git diff --name-only HEAD~2
```

Expected changed implementation files:

```text
.env.example
README.md
src/api.test.ts
src/api.ts
src/components/ReceiptInput.tsx
src/validation.test.ts
src/validation.ts
```

The spec and plan files may also appear in earlier commits. No backend or emissions dataset file may appear in the implementation diff.

- [ ] **Step 6: Prepare the local backend environment when `.venv` is absent**

Run:

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

Expected: FastAPI, Uvicorn, and the existing backend dependencies install into the ignored local virtual environment.

- [ ] **Step 7: Start FastAPI and verify health in a separate terminal**

Run:

```bash
.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000
```

Then run:

```bash
curl --fail-with-body http://127.0.0.1:8000/health
```

Expected:

```json
{"status":"ok"}
```

- [ ] **Step 8: Verify the backend manual endpoint with a locally matched item**

Run:

```bash
curl --fail-with-body \
  -X POST http://127.0.0.1:8000/api/receipts/analyze \
  -H 'Content-Type: application/json' \
  --data '{"items":[{"raw_item":"OATLY BARISTA OAT MILK","qty":1}]}'
```

Expected: HTTP 200 JSON containing `summary.total_co2e_kg` and a non-empty `line_items` array.

- [ ] **Step 9: Start the frontend in live mode and verify the manual flow**

Run in a separate terminal:

```bash
VITE_API_MODE=live VITE_API_BASE_URL=http://127.0.0.1:8000 npm run dev -- --host 127.0.0.1
```

Open the printed Vite URL, choose **Enter manually**, add `OATLY BARISTA OAT MILK` with a positive price and quantity `1`, calculate, and verify that a total and an `Oat milk` line item render without an error.

- [ ] **Step 10: Verify receipt error or success behavior**

With `GEMINI_API_KEY` configured in the backend environment, upload a JPEG, PNG, or WebP receipt and verify that the total and line items render. Without the key, upload a supported image and verify that the backend's service-unavailable message appears, the selected file remains visible, and **Try again** is available.

- [ ] **Step 11: Commit configuration and documentation**

```bash
git add .env.example README.md
git commit -m "docs: explain live frontend backend setup"
```

- [ ] **Step 12: Confirm the worktree is clean**

Run:

```bash
git status --short
```

Expected: no output.
