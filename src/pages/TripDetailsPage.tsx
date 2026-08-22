import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import ConfirmDialog from "../components/ConfirmDialog";
import { formatEmissions, formatSavedAt } from "../format";
import { useTripRepository } from "../history/TripRepositoryContext";
import type { SavedTrip } from "../history/types";

export default function TripDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const repository = useTripRepository();
  const [trip, setTrip] = useState<SavedTrip | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let active = true;
    if (!id) {
      setTrip(null);
      return;
    }
    repository.getTrip(id).then(
      (savedTrip) => {
        if (active) setTrip(savedTrip);
      },
      (failure: unknown) => {
        if (!active) return;
        setError(
          failure instanceof Error
            ? failure.message
            : "Unable to load this saved trip.",
        );
      },
    );
    return () => {
      active = false;
    };
  }, [id, repository]);

  async function deleteTrip() {
    if (!trip) return;
    setDeleting(true);
    setError(null);
    try {
      await repository.deleteTrip(trip.id);
      navigate("/history", { replace: true });
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Unable to delete this trip.",
      );
      setDeleting(false);
      setConfirming(false);
    }
  }

  if (trip === undefined && error === null) {
    return <main className="app-main"><p role="status">Loading trip details...</p></main>;
  }

  if (error && !trip) {
    return (
      <main className="app-main">
        <h1 data-route-heading tabIndex={-1}>Unable to load trip</h1>
        <p className="error-card" role="alert">{error}</p>
        <Link to="/history">Back to History</Link>
      </main>
    );
  }

  if (!trip) {
    return (
      <main className="app-main">
        <h1 data-route-heading tabIndex={-1}>Trip not found</h1>
        <p>This saved trip is not available.</p>
        <Link to="/history">Back to History</Link>
      </main>
    );
  }

  const source = trip.source === "receipt" ? "Receipt" : "Manual entry";
  return (
    <main className="app-main trip-details">
      <Link className="text-link" to="/history">← Back to History</Link>
      <p className="eyebrow">{source}</p>
      <h1 data-route-heading tabIndex={-1}>Trip details</h1>
      <p>{formatSavedAt(trip.savedAt)}</p>
      <section className="trip-total" aria-label="Trip total">
        <span>Total footprint</span>
        <strong>{formatEmissions(trip.totalCo2eKg)}</strong>
      </section>
      <section>
        <h2>Items</h2>
        <ul className="trip-items">
          {trip.items.map((item) => (
            <li key={item.id}>
              <span>{item.name}</span>
              <strong>{formatEmissions(item.co2eKg)}</strong>
            </li>
          ))}
        </ul>
      </section>
      {error && <p className="error-card" role="alert">{error}</p>}
      <button
        className="danger-button"
        type="button"
        onClick={() => setConfirming(true)}
      >
        Delete trip
      </button>
      <ConfirmDialog
        open={confirming}
        title="Delete this trip?"
        description="This removes the trip from History and Progress. This cannot be undone."
        confirmLabel="Delete permanently"
        busy={deleting}
        onCancel={() => setConfirming(false)}
        onConfirm={() => void deleteTrip()}
      />
    </main>
  );
}
