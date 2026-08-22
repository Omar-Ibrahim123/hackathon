import { describe, expect, it } from "vitest";

import { buildProgressSummary } from "./progress";
import type { SavedTrip } from "./types";

function trip(id: string, savedAt: string, totalCo2eKg: number): SavedTrip {
  return { id, savedAt, totalCo2eKg, source: "receipt", items: [] };
}

describe("buildProgressSummary", () => {
  it("builds oldest-to-current local calendar month totals", () => {
    const summary = buildProgressSummary(
      [
        trip("march", "2026-03-10T12:00:00", 2),
        trip("july-a", "2026-07-03T12:00:00", 4),
        trip("july-b", "2026-07-20T12:00:00", 6),
        trip("august", "2026-08-02T12:00:00", 15),
        trip("old", "2026-02-10T12:00:00", 100),
      ],
      new Date("2026-08-22T12:00:00"),
    );

    expect(summary.months.map((month) => month.totalCo2eKg)).toEqual([
      2, 0, 0, 0, 10, 15,
    ]);
    expect(summary.currentMonthChangePercent).toBe(50);
    expect(summary.averageTripCo2eKg).toBeCloseTo(6.75);
    expect(summary.highestImpactTrip?.id).toBe("august");
  });

  it("omits percentage change when the previous month is zero", () => {
    const summary = buildProgressSummary(
      [trip("august", "2026-08-02T12:00:00", 5)],
      new Date("2026-08-22T12:00:00"),
    );

    expect(summary.currentMonthChangePercent).toBeNull();
  });

  it("returns empty insights when the window contains no trips", () => {
    const summary = buildProgressSummary([], new Date("2026-08-22T12:00:00"));

    expect(summary.tripCount).toBe(0);
    expect(summary.averageTripCo2eKg).toBeNull();
    expect(summary.highestImpactTrip).toBeNull();
  });

  it("uses the newest trip when highest-impact totals tie", () => {
    const summary = buildProgressSummary(
      [
        trip("older", "2026-08-02T12:00:00", 5),
        trip("newer", "2026-08-12T12:00:00", 5),
      ],
      new Date("2026-08-22T12:00:00"),
    );

    expect(summary.highestImpactTrip?.id).toBe("newer");
  });
});
