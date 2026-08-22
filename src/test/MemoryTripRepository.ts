import type { TripRepository } from "../history/TripRepository";
import type { NewTrip, SavedTrip } from "../history/types";

export class MemoryTripRepository implements TripRepository {
  readonly savedInputs: NewTrip[] = [];
  readonly deletedIds: string[] = [];

  constructor(
    private trips: SavedTrip[] = [],
    private readonly failureMessage: string | null = null,
  ) {}

  private fail(): void {
    if (this.failureMessage) throw new Error(this.failureMessage);
  }

  async listTrips(): Promise<SavedTrip[]> {
    this.fail();
    return [...this.trips];
  }

  async getTrip(id: string): Promise<SavedTrip | null> {
    this.fail();
    return this.trips.find((trip) => trip.id === id) ?? null;
  }

  async saveTrip(trip: NewTrip): Promise<SavedTrip> {
    this.fail();
    this.savedInputs.push(trip);
    const saved = {
      ...trip,
      id: `saved-${this.savedInputs.length}`,
      savedAt: "2026-08-22T12:00:00.000Z",
    };
    this.trips = [...this.trips, saved];
    return saved;
  }

  async deleteTrip(id: string): Promise<void> {
    this.fail();
    this.deletedIds.push(id);
    this.trips = this.trips.filter((trip) => trip.id !== id);
  }
}
