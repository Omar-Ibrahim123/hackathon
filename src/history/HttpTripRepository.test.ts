import { afterEach, describe, expect, it, vi } from "vitest";

import { TripRepositoryError } from "./TripRepository";
import { HttpTripRepository } from "./HttpTripRepository";
import type { NewTrip, SavedTrip } from "./types";

const newTrip: NewTrip = {
  source: "receipt",
  totalCo2eKg: 6.4,
  items: [{ id: "item-0", name: "Milk", co2eKg: 1.2 }],
};
const savedTrip: SavedTrip = {
  ...newTrip,
  id: "trip_9",
  savedAt: "2026-08-22T15:00:00.000Z",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HttpTripRepository", () => {
  it("saves a trip and returns the backend canonical record", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(savedTrip, 201));
    vi.stubGlobal("fetch", fetchMock);
    const repository = new HttpTripRepository("https://api.example.test/");

    await expect(repository.saveTrip(newTrip)).resolves.toEqual(savedTrip);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/api/trips",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newTrip),
      },
    );
  });

  it("lists complete saved trips", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([savedTrip])));

    await expect(
      new HttpTripRepository("https://api.example.test").listTrips(),
    ).resolves.toEqual([savedTrip]);
  });

  it("passes a legacy reference through as an encoded path", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(savedTrip));
    vi.stubGlobal("fetch", fetchMock);
    const repository = new HttpTripRepository("https://api.example.test");

    await expect(repository.getTrip("legacy/id?")).resolves.toEqual(savedTrip);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/api/trips/legacy%2Fid%3F",
      undefined,
    );
  });

  it("maps a missing trip response to null", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ detail: "Trip not found." }, 404)),
    );

    await expect(
      new HttpTripRepository("https://api.example.test").getTrip("missing"),
    ).resolves.toBeNull();
  });

  it("deletes by encoded canonical or legacy reference", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const repository = new HttpTripRepository("https://api.example.test");

    await expect(repository.deleteTrip("legacy/id")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/api/trips/legacy%2Fid",
      { method: "DELETE" },
    );
  });

  it("imports browser trips and returns canonical records", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([savedTrip]));
    vi.stubGlobal("fetch", fetchMock);
    const repository = new HttpTripRepository("https://api.example.test");
    const localTrip = { ...savedTrip, id: "legacy-id" };

    await expect(repository.importTrips([localTrip])).resolves.toEqual([savedTrip]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/api/trips/import",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trips: [localTrip] }),
      },
    );
  });

  it("surfaces a backend error detail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ detail: "History is locked." }, 503)),
    );

    await expect(
      new HttpTripRepository("https://api.example.test").listTrips(),
    ).rejects.toThrow("History is locked.");
  });

  it("converts network failures into a repository error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));

    await expect(
      new HttpTripRepository("https://api.example.test").listTrips(),
    ).rejects.toBeInstanceOf(TripRepositoryError);
  });

  it("rejects malformed successful trip data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse([{ ...savedTrip, savedAt: "not-a-date" }])),
    );

    await expect(
      new HttpTripRepository("https://api.example.test").listTrips(),
    ).rejects.toBeInstanceOf(TripRepositoryError);
  });
});
