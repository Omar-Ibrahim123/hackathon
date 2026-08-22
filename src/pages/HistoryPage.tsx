import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { formatEmissions, formatSavedAt } from "../format";
import { useTripRepository } from "../history/TripRepositoryContext";
import type { SavedTrip } from "../history/types";

export default function HistoryPage() {
  const repository = useTripRepository();
  const [trips, setTrips] = useState<SavedTrip[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    repository.listTrips().then(
      (savedTrips) => {
        if (!active) return;
        setTrips(
          [...savedTrips].sort(
            (a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt),
          ),
        );
      },
      (failure: unknown) => {
        if (!active) return;
        setError(
          failure instanceof Error
            ? failure.message
            : "Unable to access saved trip history.",
        );
      },
    );
    return () => {
      active = false;
    };
  }, [repository]);

  return (
    <main className="app-main">
      <p className="eyebrow">Your saved calculations</p>
      <h1 data-route-heading tabIndex={-1}>History</h1>

      {trips === null && error === null && (
        <p className="status-card" role="status">Loading trip history...</p>
      )}
      {error && <p className="error-card" role="alert">{error}</p>}
      {trips?.length === 0 && (
        <section className="empty-state">
          <h2>No saved trips yet</h2>
          <p>Receipt calculations save automatically.</p>
          <p>Manual calculations appear after you save them.</p>
          <Link className="text-link" to="/">Calculate a trip</Link>
        </section>
      )}
      {trips && trips.length > 0 && (
        <ol className="history-list">
          {trips.map((trip) => {
            const source = trip.source === "receipt" ? "Receipt" : "Manual entry";
            return (
              <li key={trip.id}>
                <Link
                  className="history-card"
                  to={`/history/${trip.id}`}
                  aria-label={`${source} trip, ${formatSavedAt(trip.savedAt)}, ${formatEmissions(trip.totalCo2eKg)}`}
                >
                  <span className={`source-badge source-${trip.source}`}>{source}</span>
                  <strong>{formatEmissions(trip.totalCo2eKg)}</strong>
                  <span>{formatSavedAt(trip.savedAt)}</span>
                  <span>{trip.items.length} {trip.items.length === 1 ? "item" : "items"}</span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </main>
  );
}
