import { beforeEach, describe, expect, it } from "vitest";

import type { ImportingTripRepository } from "./HttpTripRepository";
import { LocalStorageTripRepository } from "./LocalStorageTripRepository";
import { MigratingTripRepository } from "./MigratingTripRepository";
import { TripRepositoryError } from "./TripRepository";
import type { NewTrip, SavedTrip } from "./types";

const newTrip: NewTrip = {
  source: "receipt",
  totalCo2eKg: 6.4,
  items: [{ id: "item-0", name: "Milk", co2eKg: 1.2 }],
  ecoSwapRecommendations: [],
};
const oldDate = new Date("2026-07-05T16:00:00.000Z");

class RecordingRemote implements ImportingTripRepository {
  readonly importCalls: SavedTrip[][] = [];
  readonly getIds: string[] = [];
  readonly deletedIds: string[] = [];

  constructor(
    private trips: SavedTrip[],
    private readonly importFailure: Error | null = null,
  ) {}

  async importTrips(trips: SavedTrip[]): Promise<SavedTrip[]> {
    this.importCalls.push(trips);
    if (this.importFailure) throw this.importFailure;
    return [...this.trips];
  }

  async listTrips(): Promise<SavedTrip[]> {
    return [...this.trips];
  }

  async getTrip(id: string): Promise<SavedTrip | null> {
    this.getIds.push(id);
    return this.trips[0] ?? null;
  }

  async saveTrip(trip: NewTrip): Promise<SavedTrip> {
    const saved = {
      ...trip,
      id: "trip-new",
      savedAt: "2026-08-22T16:00:00.000Z",
    };
    this.trips.push(saved);
    return saved;
  }

  async deleteTrip(id: string): Promise<void> {
    this.deletedIds.push(id);
  }
}

async function localWithOneTrip(): Promise<{
  local: LocalStorageTripRepository;
  original: SavedTrip;
}> {
  const local = new LocalStorageTripRepository(
    window.localStorage,
    () => "legacy-id",
    () => oldDate,
  );
  const original = await local.saveTrip(newTrip);
  return { local, original };
}

describe("MigratingTripRepository", () => {
  beforeEach(() => window.localStorage.clear());

  it("imports once, preserves timestamps, then clears local trips", async () => {
    window.localStorage.setItem("greenercart.welcome-complete", "true");
    const { local, original } = await localWithOneTrip();
    const canonical = { ...original, id: "trip_1" };
    const remote = new RecordingRemote([canonical]);
    const repository = new MigratingTripRepository(local, remote);

    await expect(repository.listTrips()).resolves.toEqual([canonical]);
    await repository.listTrips();

    expect(remote.importCalls).toEqual([[original]]);
    await expect(local.listTrips()).resolves.toEqual([]);
    expect(window.localStorage.getItem("greenercart.welcome-complete")).toBe(
      "true",
    );
  });

  it("shares one migration across concurrent operations", async () => {
    const { local, original } = await localWithOneTrip();
    const remote = new RecordingRemote([{ ...original, id: "trip_1" }]);
    const repository = new MigratingTripRepository(local, remote);

    await Promise.all([repository.listTrips(), repository.getTrip("legacy-id")]);

    expect(remote.importCalls).toHaveLength(1);
  });

  it("retains local trips and blocks the operation when import fails", async () => {
    const { local, original } = await localWithOneTrip();
    const remote = new RecordingRemote(
      [],
      new TripRepositoryError("Backend unavailable."),
    );
    const repository = new MigratingTripRepository(local, remote);

    await expect(repository.listTrips()).rejects.toThrow("Backend unavailable.");
    await expect(local.listTrips()).resolves.toEqual([original]);
  });

  it("retains local trips when import returns an incomplete result", async () => {
    const { local, original } = await localWithOneTrip();
    const repository = new MigratingTripRepository(
      local,
      new RecordingRemote([]),
    );

    await expect(repository.listTrips()).rejects.toThrow(
      "The trip migration returned an incomplete result.",
    );
    await expect(local.listTrips()).resolves.toEqual([original]);
  });

  it("passes legacy route IDs through after migration", async () => {
    const { local, original } = await localWithOneTrip();
    const canonical = { ...original, id: "trip_1" };
    const remote = new RecordingRemote([canonical]);
    const repository = new MigratingTripRepository(local, remote);

    await expect(repository.getTrip("legacy-id")).resolves.toEqual(canonical);
    await repository.deleteTrip("legacy-id");

    expect(remote.getIds).toEqual(["legacy-id"]);
    expect(remote.deletedIds).toEqual(["legacy-id"]);
  });
});
