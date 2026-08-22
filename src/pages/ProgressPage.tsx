import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import ProgressChart from "../components/ProgressChart";
import { formatCarMiles } from "../emissions";
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

function deltaDirection(change: number | null): "good" | "bad" | "flat" {
  if (change === null || change === 0) return "flat";
  return change > 0 ? "bad" : "good";
}

const DELTA_PATHS: Record<"good" | "bad" | "flat", string> = {
  good: "M4.5 4.5 L11.5 11.5 M11.5 6.5 V11.5 H6.5",
  bad: "M4.5 11.5 L11.5 4.5 M6.5 4.5 H11.5 V9.5",
  flat: "M4.5 8 H11.5",
};

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
  const direction = deltaDirection(summary?.latestUploadChangePercent ?? null);

  return (
    <main className="app-main progress-page">
      <p className="eyebrow">Latest six uploads</p>
      <h1 data-route-heading tabIndex={-1}>Progress &amp; Insights</h1>

      {trips === null && error === null && (
        <p className="status-card" role="status">Loading your progress...</p>
      )}
      {error && <p className="error-card" role="alert">{error}</p>}
      {summary?.tripCount === 0 && (
        <section className="empty-state empty-editorial">
          <svg
            className="empty-glyph"
            viewBox="0 0 20 20"
            width="44"
            height="44"
            aria-hidden="true"
          >
            <path
              d="M4 16v-4 M10 16V8 M16 16V4"
              fill="none"
              stroke="var(--green)"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
          <h2>See how your footprint changes</h2>
          <p>Save your first trip to see progress over time.</p>
          <Link className="text-link" to="/">Calculate a trip</Link>
        </section>
      )}
      {summary && summary.tripCount > 0 && (
        <>
          <section className="progress-panel" aria-labelledby="uploads-heading">
            <div className="panel-head">
              <h2 id="uploads-heading">Recent uploads</h2>
              <p className="chart-caption">Kilograms of CO₂e per shopping trip</p>
            </div>
            <ProgressChart uploads={summary.uploads} />
          </section>
          <section className="insights-grid" aria-label="Carbon insights">
            <article className="insight-card">
              <span>Latest upload change</span>
              <span className="delta-row">
                <span className={`delta-icon delta-${direction}`} aria-hidden="true">
                  <svg viewBox="0 0 16 16" width="14" height="14">
                    <path
                      d={DELTA_PATHS[direction]}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <strong className={`delta-text delta-text-${direction}`}>
                  {comparisonText(summary.latestUploadChangePercent)}
                </strong>
              </span>
            </article>
            <article className="insight-card">
              <span>Average upload</span>
              <strong>{formatEmissions(summary.averageTripCo2eKg ?? 0)} per upload</strong>
            </article>
            <article className="insight-card insight-dark">
              <svg
                className="dark-rings"
                viewBox="0 0 260 260"
                width="260"
                height="260"
                aria-hidden="true"
              >
                <circle cx="130" cy="130" r="60" fill="none" stroke="rgba(255,255,255,.10)" strokeWidth="1.25" />
                <circle cx="130" cy="130" r="90" fill="none" stroke="rgba(255,255,255,.10)" strokeWidth="1.25" />
                <circle cx="130" cy="130" r="120" fill="none" stroke="rgba(255,255,255,.10)" strokeWidth="1.25" />
              </svg>
              <span>Total footprint (last {summary.tripCount} uploads)</span>
              <strong>{formatEmissions(summary.totalTripCo2eKg)}</strong>
              <small>{`That's like ${formatCarMiles(summary.totalTripCo2eKg)} in an average car`}</small>
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
            {summary.swapRecommendation && (
              <Link
                className="insight-card insight-link swap-recommendation-card"
                to={`/history/${summary.swapRecommendation.tripId}`}
                aria-label={`Swap recommendation, ${summary.swapRecommendation.recommendation.originalItem} for ${summary.swapRecommendation.recommendation.recommendedSwap}`}
              >
                <h2>Swap recommendation</h2>
                <strong>
                  {summary.swapRecommendation.recommendation.originalItem} →{" "}
                  {summary.swapRecommendation.recommendation.recommendedSwap}
                </strong>
                <small>
                  Potential saving:{" "}
                  {formatEmissions(
                    summary.swapRecommendation.recommendation
                      .potentialSavingsKg,
                  )}
                </small>
              </Link>
            )}
          </section>
        </>
      )}
    </main>
  );
}
