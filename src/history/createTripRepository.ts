import { apiBaseUrl } from "../apiConfig";
import type { ApiMode } from "../types";
import { HttpTripRepository } from "./HttpTripRepository";
import { LocalStorageTripRepository } from "./LocalStorageTripRepository";
import { MigratingTripRepository } from "./MigratingTripRepository";
import type { TripRepository } from "./TripRepository";

export function createTripRepository({
  mode,
  baseUrl = apiBaseUrl,
  storage = window.localStorage,
}: {
  mode: ApiMode;
  baseUrl?: string;
  storage?: Storage;
}): TripRepository {
  const local = new LocalStorageTripRepository(storage);
  if (mode === "mock") return local;
  return new MigratingTripRepository(local, new HttpTripRepository(baseUrl));
}
