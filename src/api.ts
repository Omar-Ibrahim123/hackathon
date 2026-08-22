import { mockAnalyzeReceipt, mockCalculateManual } from "./mockApi";
import { apiBaseUrl as baseUrl, apiMode as mode } from "./apiConfig";
import type {
  CarbonResult,
  CarbonResultItem,
  ManualGroceryItem,
} from "./types";

const INVALID_RESPONSE_MESSAGE =
  "The calculation service returned an invalid response.";
const REQUEST_FAILURE_MESSAGE =
  "Unable to calculate your groceries right now.";

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

async function responseError(response: Response): Promise<Error> {
  try {
    const body = (await response.json()) as Record<string, unknown>;
    const message = body.error ?? body.detail ?? body.message;
    if (typeof message === "string" && message.trim()) {
      return new Error(message);
    }
  } catch {
    // The fallback below also covers non-JSON error bodies.
  }
  return new Error(REQUEST_FAILURE_MESSAGE);
}

async function readResult(response: Response): Promise<CarbonResult> {
  if (!response.ok) throw await responseError(response);
  try {
    return parseCarbonResult(await response.json());
  } catch (error) {
    if (error instanceof Error && error.message === INVALID_RESPONSE_MESSAGE) {
      throw error;
    }
    throw new Error(INVALID_RESPONSE_MESSAGE);
  }
}

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
