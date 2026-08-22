export type TripSource = "receipt" | "manual";

export interface SavedTripItem {
  id: string;
  name: string;
  co2eKg: number;
}

export interface NewTrip {
  source: TripSource;
  totalCo2eKg: number;
  items: SavedTripItem[];
}

export interface SavedTrip extends NewTrip {
  id: string;
  savedAt: string;
}
