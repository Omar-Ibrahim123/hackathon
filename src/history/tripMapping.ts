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
    ecoSwapRecommendations: result.ecoSwapRecommendations.map(
      (recommendation) => ({ ...recommendation }),
    ),
  };
}
