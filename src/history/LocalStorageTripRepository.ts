import { TripRepositoryError, type TripRepository } from "./TripRepository";
import { parseSavedTrips } from "./tripValidation";
import type { NewTrip, SavedTrip } from "./types";

const STORAGE_KEY = "greenercart.saved-trips";
const STORAGE_VERSION = 2;

interface StoredTrips {
  version: 2;
  trips: SavedTrip[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export class LocalStorageTripRepository implements TripRepository {
  constructor(
    private readonly storage: Storage = window.localStorage,
    private readonly createId: () => string = () => crypto.randomUUID(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  private read(): SavedTrip[] {
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (raw === null) return [];
      const value: unknown = JSON.parse(raw);
      if (
        !isRecord(value) ||
        (value.version !== 1 && value.version !== STORAGE_VERSION) ||
        !Array.isArray(value.trips)
      ) {
        throw new TripRepositoryError();
      }
      const normalized = value.version === 1
        ? value.trips.map((trip) =>
            isRecord(trip)
              ? { ...trip, ecoSwapRecommendations: [] }
              : trip,
          )
        : value.trips;
      const trips = parseSavedTrips(normalized);
      if (trips === null) throw new TripRepositoryError();
      return trips;
    } catch (error) {
      if (error instanceof TripRepositoryError) throw error;
      throw new TripRepositoryError();
    }
  }

  private write(trips: SavedTrip[]): void {
    const envelope: StoredTrips = { version: STORAGE_VERSION, trips };
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(envelope));
    } catch {
      throw new TripRepositoryError("Unable to save trip history.");
    }
  }

  async listTrips(): Promise<SavedTrip[]> {
    return this.read();
  }

  async getTrip(id: string): Promise<SavedTrip | null> {
    return this.read().find((trip) => trip.id === id) ?? null;
  }

  async saveTrip(trip: NewTrip): Promise<SavedTrip> {
    const savedTrip: SavedTrip = {
      ...trip,
      id: this.createId(),
      savedAt: this.now().toISOString(),
    };
    this.write([...this.read(), savedTrip]);
    return savedTrip;
  }

  async deleteTrip(id: string): Promise<void> {
    this.write(this.read().filter((trip) => trip.id !== id));
  }

  clearTrips(): void {
    try {
      this.storage.removeItem(STORAGE_KEY);
    } catch {
      throw new TripRepositoryError("Unable to clear migrated trip history.");
    }
  }
}
