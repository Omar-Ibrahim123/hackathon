import type { ImportingTripRepository } from "./HttpTripRepository";
import { LocalStorageTripRepository } from "./LocalStorageTripRepository";
import {
  TripRepositoryError,
  type TripRepository,
} from "./TripRepository";
import type { NewTrip, SavedTrip } from "./types";

export class MigratingTripRepository implements TripRepository {
  private migration: Promise<void> | null = null;

  constructor(
    private readonly local: LocalStorageTripRepository,
    private readonly remote: ImportingTripRepository,
  ) {}

  private ensureMigrated(): Promise<void> {
    this.migration ??= this.migrate();
    return this.migration;
  }

  private async migrate(): Promise<void> {
    const trips = await this.local.listTrips();
    if (trips.length === 0) return;
    const imported = await this.remote.importTrips(trips);
    if (imported.length !== trips.length) {
      throw new TripRepositoryError(
        "The trip migration returned an incomplete result.",
      );
    }
    this.local.clearTrips();
  }

  async listTrips(): Promise<SavedTrip[]> {
    await this.ensureMigrated();
    return this.remote.listTrips();
  }

  async getTrip(id: string): Promise<SavedTrip | null> {
    await this.ensureMigrated();
    return this.remote.getTrip(id);
  }

  async saveTrip(trip: NewTrip): Promise<SavedTrip> {
    await this.ensureMigrated();
    return this.remote.saveTrip(trip);
  }

  async deleteTrip(id: string): Promise<void> {
    await this.ensureMigrated();
    return this.remote.deleteTrip(id);
  }
}
