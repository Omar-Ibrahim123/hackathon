import type { NewTrip, SavedTrip } from "./types";

export interface TripRepository {
  listTrips(): Promise<SavedTrip[]>;
  getTrip(id: string): Promise<SavedTrip | null>;
  saveTrip(trip: NewTrip): Promise<SavedTrip>;
  deleteTrip(id: string): Promise<void>;
}

export class TripRepositoryError extends Error {
  constructor(message = "Unable to access saved trip history.") {
    super(message);
    this.name = "TripRepositoryError";
  }
}
