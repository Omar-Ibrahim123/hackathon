import { describe, expect, it } from "vitest";

import { buildProgressSummary } from "./progress";
import type { SavedTrip } from "./types";

function trip(id: string, savedAt: string, totalCo2eKg: number): SavedTrip {
  return { id, savedAt, totalCo2eKg, source: "receipt", items: [] };
}

describe("buildProgressSummary", () => {
  it("returns the six most recent uploads in chronological order", () => {
    const summary = buildProgressSummary([
      trip("upload-4", "2026-08-04T12:00:00Z", 4),
      trip("upload-7", "2026-08-07T12:00:00Z", 14),
      trip("upload-2", "2026-08-02T12:00:00Z", 2),
      trip("upload-6", "2026-08-06T12:00:00Z", 7),
      trip("upload-1", "2026-08-01T12:00:00Z", 100),
      trip("upload-5", "2026-08-05T12:00:00Z", 5),
      trip("upload-3", "2026-08-03T12:00:00Z", 3),
    ]);

    expect(summary.uploads.map((upload) => upload.id)).toEqual([
      "upload-2",
      "upload-3",
      "upload-4",
      "upload-5",
      "upload-6",
      "upload-7",
    ]);
    expect(summary.latestUploadChangePercent).toBe(100);
    expect(summary.averageTripCo2eKg).toBeCloseTo(35 / 6);
    expect(summary.totalTripCo2eKg).toBeCloseTo(35);
    expect(summary.highestImpactTrip?.id).toBe("upload-7");
  });

  it("omits percentage change when there is no comparable previous upload", () => {
    expect(
      buildProgressSummary([trip("only", "2026-08-02T12:00:00Z", 5)])
        .latestUploadChangePercent,
    ).toBeNull();
    expect(
      buildProgressSummary([
        trip("zero", "2026-08-01T12:00:00Z", 0),
        trip("latest", "2026-08-02T12:00:00Z", 5),
      ]).latestUploadChangePercent,
    ).toBeNull();
  });

  it("returns empty insights when there are no uploads", () => {
    const summary = buildProgressSummary([]);

    expect(summary.uploads).toEqual([]);
    expect(summary.tripCount).toBe(0);
    expect(summary.averageTripCo2eKg).toBeNull();
    expect(summary.totalTripCo2eKg).toBe(0);
    expect(summary.highestImpactTrip).toBeNull();
  });

  it("uses the newest upload when highest-impact totals tie", () => {
    const summary = buildProgressSummary([
      trip("older", "2026-08-02T12:00:00Z", 5),
      trip("newer", "2026-08-12T12:00:00Z", 5),
    ]);

    expect(summary.highestImpactTrip?.id).toBe("newer");
  });
});
