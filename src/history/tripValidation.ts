import type { EcoSwapRecommendation } from "../types";
import type { SavedTrip, SavedTripItem, TripSource } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isSource(value: unknown): value is TripSource {
  return value === "receipt" || value === "manual";
}

function parseItem(value: unknown): SavedTripItem | null {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.name) ||
    !isNonNegativeFiniteNumber(value.co2eKg)
  ) {
    return null;
  }
  return { id: value.id, name: value.name, co2eKg: value.co2eKg };
}

function parseRecommendation(value: unknown): EcoSwapRecommendation | null {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.originalItem) ||
    !isNonNegativeFiniteNumber(value.originalCo2eKg) ||
    !isNonEmptyString(value.recommendedSwap) ||
    !isNonNegativeFiniteNumber(value.swapCo2eKg) ||
    !isNonNegativeFiniteNumber(value.potentialSavingsKg) ||
    value.potentialSavingsKg <= 0 ||
    value.swapCo2eKg >= value.originalCo2eKg
  ) {
    return null;
  }
  return {
    originalItem: value.originalItem.trim(),
    originalCo2eKg: value.originalCo2eKg,
    recommendedSwap: value.recommendedSwap.trim(),
    swapCo2eKg: value.swapCo2eKg,
    potentialSavingsKg: value.potentialSavingsKg,
  };
}

export function parseSavedTrip(value: unknown): SavedTrip | null {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.id) ||
    !isSource(value.source) ||
    !isNonEmptyString(value.savedAt) ||
    !Number.isFinite(Date.parse(value.savedAt)) ||
    !isNonNegativeFiniteNumber(value.totalCo2eKg) ||
    !Array.isArray(value.items)
  ) {
    return null;
  }
  const items = value.items.map(parseItem);
  if (items.some((item) => item === null)) return null;
  const itemIds = items.map((item) => item!.id);
  if (new Set(itemIds).size !== itemIds.length) return null;
  const rawRecommendations = value.ecoSwapRecommendations ?? [];
  if (!Array.isArray(rawRecommendations)) return null;
  const recommendations = rawRecommendations.map(parseRecommendation);
  if (recommendations.some((recommendation) => recommendation === null)) {
    return null;
  }
  return {
    id: value.id,
    source: value.source,
    savedAt: value.savedAt,
    totalCo2eKg: value.totalCo2eKg,
    items: items as SavedTripItem[],
    ecoSwapRecommendations: recommendations as EcoSwapRecommendation[],
  };
}

export function parseSavedTrips(value: unknown): SavedTrip[] | null {
  if (!Array.isArray(value)) return null;
  const trips = value.map(parseSavedTrip);
  return trips.some((trip) => trip === null) ? null : (trips as SavedTrip[]);
}
