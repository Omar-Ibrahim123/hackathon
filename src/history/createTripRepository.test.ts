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

  it("uses migration-aware backend history in live mode", () => {
    expect(
      createTripRepository({
        mode: "live",
        baseUrl: "https://api.example.test",
        storage: window.localStorage,
      }),
    ).toBeInstanceOf(MigratingTripRepository);
  });
});
