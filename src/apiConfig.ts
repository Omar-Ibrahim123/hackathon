import type { ApiMode } from "./types";

export type HistoryStorage = "local" | "backend";

export function resolveApiMode(value: string | undefined): ApiMode {
  if (!value) return "mock";
  if (value === "mock" || value === "live") return value;
  throw new Error(
    `Unsupported VITE_API_MODE "${value}". Use "mock" or "live".`,
  );
}

// Defaults to the browser's localStorage so deployed visitors keep a
// private history that survives backend redeploys (the hosted SQLite DB
// is wiped on every deploy). "backend" opts into server-side history.
export function resolveHistoryStorage(
  value: string | undefined,
): HistoryStorage {
  if (!value) return "local";
  if (value === "local" || value === "backend") return value;
  throw new Error(
    `Unsupported VITE_HISTORY_STORAGE "${value}". Use "local" or "backend".`,
  );
}

export const apiMode = resolveApiMode(import.meta.env.VITE_API_MODE);
export const historyStorage = resolveHistoryStorage(
  import.meta.env.VITE_HISTORY_STORAGE,
);
export const apiBaseUrl = (
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000"
).replace(/\/$/, "");
