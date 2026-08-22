import { Link } from "react-router-dom";

export default function TripDetailsPage() {
  return (
    <main className="app-main">
      <h1 data-route-heading tabIndex={-1}>Trip not found</h1>
      <p>This saved trip is not available.</p>
      <Link to="/history">Back to History</Link>
    </main>
  );
}
