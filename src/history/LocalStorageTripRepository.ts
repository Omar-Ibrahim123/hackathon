import { TripRepositoryError, type TripRepository } from "./TripRepository";
import type { NewTrip, SavedTrip, SavedTripItem, TripSource } from "./types";

const STORAGE_KEY = "greenercart.saved-trips";
const STORAGE_VERSION = 1;

interface StoredTrips {
  version: 1;
  trips: SavedTrip[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isSource(value: unknown): value is TripSource {
  return value === "receipt" || value === "manual";
}

function isItem(value: unknown): value is SavedTripItem {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.name === "string" &&
    value.name.trim().length > 0 &&
    isNonNegativeNumber(value.co2eKg)
  );
}

function isTrip(value: unknown): value is SavedTrip {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    isSource(value.source) &&
    typeof value.savedAt === "string" &&
    Number.isFinite(Date.parse(value.savedAt)) &&
    isNonNegativeNumber(value.totalCo2eKg) &&
    Array.isArray(value.items) &&
    value.items.every(isItem)
  );
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
        value.version !== STORAGE_VERSION ||
        !Array.isArray(value.trips) ||
        !value.trips.every(isTrip)
      ) {
        throw new TripRepositoryError();
      }
      return value.trips;
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
}
