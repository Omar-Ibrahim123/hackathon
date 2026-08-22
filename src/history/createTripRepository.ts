import { apiBaseUrl, historyStorage, type HistoryStorage } from "../apiConfig";
import type { ApiMode } from "../types";
import { HttpTripRepository } from "./HttpTripRepository";
import { LocalStorageTripRepository } from "./LocalStorageTripRepository";
import { MigratingTripRepository } from "./MigratingTripRepository";
import type { TripRepository } from "./TripRepository";

export function createTripRepository({
  mode,
  history = historyStorage,
  baseUrl = apiBaseUrl,
  storage = window.localStorage,
}: {
  mode: ApiMode;
  history?: HistoryStorage;
  baseUrl?: string;
  storage?: Storage;
}): TripRepository {
  const local = new LocalStorageTripRepository(storage);
  if (mode === "mock" || history === "local") return local;
  return new MigratingTripRepository(local, new HttpTripRepository(baseUrl));
}
