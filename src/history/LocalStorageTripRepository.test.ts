import { beforeEach, describe, expect, it } from "vitest";

import { LocalStorageTripRepository } from "./LocalStorageTripRepository";
import { TripRepositoryError } from "./TripRepository";
import type { NewTrip } from "./types";

const newTrip: NewTrip = {
  source: "receipt",
  totalCo2eKg: 6.4,
  items: [{ id: "beef", name: "Ground beef", co2eKg: 3.1 }],
};

describe("LocalStorageTripRepository", () => {
  beforeEach(() => window.localStorage.clear());

  it("assigns and returns the canonical id and timestamp", async () => {
    const repository = new LocalStorageTripRepository(
      window.localStorage,
      () => "trip-123",
      () => new Date("2026-08-22T12:00:00.000Z"),
    );

    const saved = await repository.saveTrip(newTrip);

    expect(saved).toEqual({
      ...newTrip,
      id: "trip-123",
      savedAt: "2026-08-22T12:00:00.000Z",
    });
    await expect(repository.getTrip("trip-123")).resolves.toEqual(saved);
    await expect(repository.listTrips()).resolves.toEqual([saved]);
  });

  it("deletes only the requested trip", async () => {
    let id = 0;
    const repository = new LocalStorageTripRepository(
      window.localStorage,
      () => `trip-${++id}`,
      () => new Date("2026-08-22T12:00:00.000Z"),
    );
    const first = await repository.saveTrip(newTrip);
    const second = await repository.saveTrip({ ...newTrip, source: "manual" });

    await repository.deleteTrip(first.id);

    await expect(repository.listTrips()).resolves.toEqual([second]);
    await expect(repository.getTrip(first.id)).resolves.toBeNull();
  });

  it("rejects malformed versioned data instead of returning partial trips", async () => {
    window.localStorage.setItem(
      "greenercart.saved-trips",
      JSON.stringify({ version: 1, trips: [{ id: "broken" }] }),
    );
    const repository = new LocalStorageTripRepository(window.localStorage);

    await expect(repository.listTrips()).rejects.toBeInstanceOf(
      TripRepositoryError,
    );
  });

  it("converts browser write failures into a controlled repository error", async () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("Quota exceeded");
      },
    } as unknown as Storage;
    const repository = new LocalStorageTripRepository(storage);

    await expect(repository.saveTrip(newTrip)).rejects.toThrow(
      "Unable to save trip history.",
    );
  });
});
