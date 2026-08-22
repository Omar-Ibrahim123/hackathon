import { beforeEach, describe, expect, it } from "vitest";

import { LocalStorageTripRepository } from "./LocalStorageTripRepository";
import { MigratingTripRepository } from "./MigratingTripRepository";
import { createTripRepository } from "./createTripRepository";

describe("createTripRepository", () => {
  beforeEach(() => window.localStorage.clear());

  it("uses local storage in mock mode", () => {
    expect(
      createTripRepository({
        mode: "mock",
        storage: window.localStorage,
      }),
    ).toBeInstanceOf(LocalStorageTripRepository);
  });

  it("keeps history in local storage by default in live mode", () => {
    expect(
      createTripRepository({
        mode: "live",
        history: "local",
        baseUrl: "https://api.example.test",
        storage: window.localStorage,
      }),
    ).toBeInstanceOf(LocalStorageTripRepository);
  });

  it("uses migration-aware backend history when opted in", () => {
    expect(
      createTripRepository({
        mode: "live",
        history: "backend",
        baseUrl: "https://api.example.test",
        storage: window.localStorage,
      }),
    ).toBeInstanceOf(MigratingTripRepository);
  });

  it("ignores backend history opt-in while in mock mode", () => {
    expect(
      createTripRepository({
        mode: "mock",
        history: "backend",
        storage: window.localStorage,
      }),
    ).toBeInstanceOf(LocalStorageTripRepository);
  });
});
