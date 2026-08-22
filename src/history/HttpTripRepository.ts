import { apiBaseUrl } from "../apiConfig";
import {
  TripRepositoryError,
  type TripRepository,
} from "./TripRepository";
import { parseSavedTrip, parseSavedTrips } from "./tripValidation";
import type { NewTrip, SavedTrip } from "./types";

const INVALID_RESPONSE_MESSAGE =
  "The trip history service returned an invalid response.";

export interface ImportingTripRepository extends TripRepository {
  importTrips(trips: SavedTrip[]): Promise<SavedTrip[]>;
}

export class HttpTripRepository implements ImportingTripRepository {
  private readonly baseUrl: string;

  constructor(baseUrl = apiBaseUrl) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  private async request(path: string, init?: RequestInit): Promise<Response> {
    try {
      return await fetch(`${this.baseUrl}${path}`, init);
    } catch {
      throw new TripRepositoryError();
    }
  }

  private async responseError(response: Response): Promise<TripRepositoryError> {
    try {
      const body = (await response.json()) as Record<string, unknown>;
      if (typeof body.detail === "string" && body.detail.trim()) {
        return new TripRepositoryError(body.detail);
      }
    } catch {
      // Use the controlled fallback below for non-JSON errors.
    }
    return new TripRepositoryError();
  }

  private async readJson(response: Response): Promise<unknown> {
    if (!response.ok) throw await this.responseError(response);
    try {
      return await response.json();
    } catch {
      throw new TripRepositoryError(INVALID_RESPONSE_MESSAGE);
    }
  }

  async listTrips(): Promise<SavedTrip[]> {
    const value = await this.readJson(await this.request("/api/trips"));
    const trips = parseSavedTrips(value);
    if (trips === null) throw new TripRepositoryError(INVALID_RESPONSE_MESSAGE);
    return trips;
  }

  async getTrip(id: string): Promise<SavedTrip | null> {
    const response = await this.request(`/api/trips/${encodeURIComponent(id)}`);
    if (response.status === 404) return null;
    const trip = parseSavedTrip(await this.readJson(response));
    if (trip === null) throw new TripRepositoryError(INVALID_RESPONSE_MESSAGE);
    return trip;
  }

  async saveTrip(trip: NewTrip): Promise<SavedTrip> {
    const response = await this.request("/api/trips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(trip),
    });
    const saved = parseSavedTrip(await this.readJson(response));
    if (saved === null) throw new TripRepositoryError(INVALID_RESPONSE_MESSAGE);
    return saved;
  }

  async deleteTrip(id: string): Promise<void> {
    const response = await this.request(`/api/trips/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!response.ok) throw await this.responseError(response);
  }

  async importTrips(trips: SavedTrip[]): Promise<SavedTrip[]> {
    const response = await this.request("/api/trips/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trips }),
    });
    const imported = parseSavedTrips(await this.readJson(response));
    if (imported === null) {
      throw new TripRepositoryError(INVALID_RESPONSE_MESSAGE);
    }
    return imported;
  }
}
