import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import ProgressChart from "../components/ProgressChart";
import { formatEmissions, formatSavedAt } from "../format";
import { buildProgressSummary } from "../history/progress";
import { useTripRepository } from "../history/TripRepositoryContext";
import type { SavedTrip } from "../history/types";

function comparisonText(change: number | null): string {
  if (change === null) return "Not enough previous-month data to compare";
  const value = Math.abs(change).toLocaleString("en-CA", {
    maximumFractionDigits: 1,
  });
  if (change > 0) return `${value}% increase from last month`;
  if (change < 0) return `${value}% decrease from last month`;
  return "No change from last month";
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
      <p className="eyebrow">Six-month view</p>
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
          <section className="progress-panel" aria-labelledby="monthly-heading">
            <h2 id="monthly-heading">Monthly footprint</h2>
            <ProgressChart months={summary.months} />
          </section>
          <section className="insights-grid" aria-label="Carbon insights">
            <article className="insight-card">
              <span>Month over month</span>
              <strong>{comparisonText(summary.currentMonthChangePercent)}</strong>
            </article>
            <article className="insight-card">
              <span>Average trip</span>
              <strong>{formatEmissions(summary.averageTripCo2eKg ?? 0)} per trip</strong>
            </article>
            {summary.highestImpactTrip && (
              <Link
                className="insight-card insight-link"
                to={`/history/${summary.highestImpactTrip.id}`}
                aria-label={`Highest-impact trip, ${formatEmissions(summary.highestImpactTrip.totalCo2eKg)}`}
              >
                <span>Highest-impact trip</span>
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
