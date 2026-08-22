import type { SavedTrip } from "./types";

export interface ProgressMonth {
  key: string;
  label: string;
  totalCo2eKg: number;
}

export interface ProgressSummary {
  months: ProgressMonth[];
  tripCount: number;
  currentMonthChangePercent: number | null;
  averageTripCo2eKg: number | null;
  highestImpactTrip: SavedTrip | null;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function buildProgressSummary(
  trips: SavedTrip[],
  now = new Date(),
): ProgressSummary {
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
    return {
      key: monthKey(date),
      label: date.toLocaleDateString("en-CA", { month: "short" }),
      totalCo2eKg: 0,
    };
  });
  const monthByKey = new Map(months.map((month) => [month.key, month]));
  const tripsInWindow = trips.filter((trip) => {
    const month = monthByKey.get(monthKey(new Date(trip.savedAt)));
    if (!month) return false;
    month.totalCo2eKg += trip.totalCo2eKg;
    return true;
  });
  const previous = months[4].totalCo2eKg;
  const current = months[5].totalCo2eKg;
  const total = tripsInWindow.reduce(
    (sum, trip) => sum + trip.totalCo2eKg,
    0,
  );
  const highestImpactTrip = tripsInWindow.reduce<SavedTrip | null>(
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
    months,
    tripCount: tripsInWindow.length,
    currentMonthChangePercent:
      previous > 0 ? ((current - previous) / previous) * 100 : null,
    averageTripCo2eKg:
      tripsInWindow.length > 0 ? total / tripsInWindow.length : null,
    highestImpactTrip,
  };
}
