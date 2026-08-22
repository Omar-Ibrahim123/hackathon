import type { SavedTrip } from "./types";

export interface ProgressUpload {
  id: string;
  label: string;
  totalCo2eKg: number;
}

export interface ProgressSummary {
  uploads: ProgressUpload[];
  tripCount: number;
  latestUploadChangePercent: number | null;
  averageTripCo2eKg: number | null;
  highestImpactTrip: SavedTrip | null;
}

export function buildProgressSummary(trips: SavedTrip[]): ProgressSummary {
  const recentTrips = [...trips]
    .sort((a, b) => Date.parse(a.savedAt) - Date.parse(b.savedAt))
    .slice(-6);
  const uploads = recentTrips.map((trip) => ({
    id: trip.id,
    label: new Date(trip.savedAt).toLocaleDateString("en-CA", {
      month: "short",
      day: "numeric",
    }),
    totalCo2eKg: trip.totalCo2eKg,
  }));
  const previous = recentTrips.at(-2)?.totalCo2eKg;
  const current = recentTrips.at(-1)?.totalCo2eKg;
  const total = recentTrips.reduce(
    (sum, trip) => sum + trip.totalCo2eKg,
    0,
  );
  const highestImpactTrip = recentTrips.reduce<SavedTrip | null>(
    (highest, trip) => {
      if (highest === null || trip.totalCo2eKg > highest.totalCo2eKg) {
        return trip;
      }
      if (
        trip.totalCo2eKg === highest.totalCo2eKg &&
        Date.parse(trip.savedAt) > Date.parse(highest.savedAt)
      ) {
        return trip;
      }
      return highest;
    },
    null,
  );

  return {
    uploads,
    tripCount: recentTrips.length,
    latestUploadChangePercent:
      previous !== undefined && previous > 0 && current !== undefined
        ? ((current - previous) / previous) * 100
        : null,
    averageTripCo2eKg:
      recentTrips.length > 0 ? total / recentTrips.length : null,
    highestImpactTrip,
  };
}
