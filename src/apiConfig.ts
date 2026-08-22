import type { ApiMode } from "./types";

export function resolveApiMode(value: string | undefined): ApiMode {
  if (!value) return "mock";
  if (value === "mock" || value === "live") return value;
  throw new Error(
    `Unsupported VITE_API_MODE "${value}". Use "mock" or "live".`,
  );
}

export const apiMode = resolveApiMode(import.meta.env.VITE_API_MODE);
export const apiBaseUrl = (
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000"
).replace(/\/$/, "");
