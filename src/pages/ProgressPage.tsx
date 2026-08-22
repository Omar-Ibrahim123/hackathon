import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import ProgressChart from "../components/ProgressChart";
import { formatEmissions, formatSavedAt } from "../format";
import { buildProgressSummary } from "../history/progress";
import { useTripRepository } from "../history/TripRepositoryContext";
import type { SavedTrip } from "../history/types";

function comparisonText(change: number | null): string {
  if (change === null) return "Not enough previous-upload data to compare";
  const value = Math.abs(change).toLocaleString("en-CA", {
    maximumFractionDigits: 1,
  });
  if (change > 0) return `${value}% increase from previous upload`;
  if (change < 0) return `${value}% decrease from previous upload`;
  return "No change from previous upload";
}

export default function ProgressPage() {
  const repository = useTripRepository();
  const [trips, setTrips] = useState<SavedTrip[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    repository.listTrips().then(
      (savedTrips) => {
        if (active) setTrips(savedTrips);
      },
      (failure: unknown) => {
        if (!active) return;
        setError(
          failure instanceof Error
            ? failure.message
            : "Unable to load progress right now.",
        );
      },
    );
    return () => {
      active = false;
    };
  }, [repository]);

  const summary = trips ? buildProgressSummary(trips) : null;

  return (
    <main className="app-main">
      <p className="eyebrow">Latest six uploads</p>
      <h1 data-route-heading tabIndex={-1}>Progress &amp; Insights</h1>

      {trips === null && error === null && (
        <p className="status-card" role="status">Loading your progress...</p>
      )}
      {error && <p className="error-card" role="alert">{error}</p>}
      {summary?.tripCount === 0 && (
        <section className="empty-state">
          <h2>See how your footprint changes</h2>
          <p>Save your first trip to see progress over time.</p>
          <Link className="text-link" to="/">Calculate a trip</Link>
        </section>
      )}
      {summary && summary.tripCount > 0 && (
        <>
          <section className="progress-panel" aria-labelledby="uploads-heading">
            <h2 id="uploads-heading">Recent uploads</h2>
            <ProgressChart uploads={summary.uploads} />
          </section>
          <section className="insights-grid" aria-label="Carbon insights">
            <article className="insight-card">
              <span>Latest upload change</span>
              <strong>{comparisonText(summary.latestUploadChangePercent)}</strong>
            </article>
            <article className="insight-card">
              <span>Average upload</span>
              <strong>{formatEmissions(summary.averageTripCo2eKg ?? 0)} per upload</strong>
            </article>
            {summary.highestImpactTrip && (
              <Link
                className="insight-card insight-link"
                to={`/history/${summary.highestImpactTrip.id}`}
                aria-label={`Highest-impact upload, ${formatEmissions(summary.highestImpactTrip.totalCo2eKg)}`}
              >
                <span>Highest-impact upload</span>
                <strong>{formatEmissions(summary.highestImpactTrip.totalCo2eKg)}</strong>
                <small>{formatSavedAt(summary.highestImpactTrip.savedAt)}</small>
              </Link>
            )}
          </section>
        </>
      )}
    </main>
  );
}
