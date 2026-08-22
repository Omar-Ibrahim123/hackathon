import { mockAnalyzeReceipt, mockCalculateManual } from "./mockApi";
import type {
  ApiMode,
  CarbonResult,
  CarbonResultItem,
  ManualCalculationRequest,
  ManualGroceryItem,
} from "./types";

const INVALID_RESPONSE_MESSAGE =
  "The calculation service returned an invalid response.";
const REQUEST_FAILURE_MESSAGE =
  "Unable to calculate your groceries right now.";

function resolveMode(value: string | undefined): ApiMode {
  if (!value) return "mock";
  if (value === "mock" || value === "live") return value;
  throw new Error(
    `Unsupported VITE_API_MODE "${value}". Use "mock" or "live".`,
  );
}

const mode = resolveMode(import.meta.env.VITE_API_MODE);
const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000")
  .replace(/\/$/, "");

function isResultItem(value: unknown): value is CarbonResultItem {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.name === "string" &&
    item.name.trim().length > 0 &&
    typeof item.co2eKg === "number" &&
    Number.isFinite(item.co2eKg) &&
    item.co2eKg >= 0
  );
}

export function parseCarbonResult(value: unknown): CarbonResult {
  if (typeof value !== "object" || value === null) {
    throw new Error(INVALID_RESPONSE_MESSAGE);
  }

  const result = value as Record<string, unknown>;
  if (
    typeof result.totalCo2eKg !== "number" ||
    !Number.isFinite(result.totalCo2eKg) ||
    result.totalCo2eKg < 0 ||
    !Array.isArray(result.items) ||
    !result.items.every(isResultItem)
  ) {
    throw new Error(INVALID_RESPONSE_MESSAGE);
  }

  return {
    totalCo2eKg: result.totalCo2eKg,
    items: result.items.map((item) => ({ ...item })),
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

export async function analyzeReceipt(file: File): Promise<CarbonResult> {
  if (mode === "mock") return mockAnalyzeReceipt(file);

  const body = new FormData();
  body.append("receipt", file);
  return readResult(
    await fetch(`${baseUrl}/api/receipts/analyze`, {
      method: "POST",
      body,
    }),
  );
}

export async function calculateManual(
  items: ManualGroceryItem[],
): Promise<CarbonResult> {
  if (mode === "mock") return mockCalculateManual(items);

  const body: ManualCalculationRequest = {
    region: "CA",
    currency: "CAD",
    items,
  };
  return readResult(
    await fetch(`${baseUrl}/api/groceries/calculate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}
