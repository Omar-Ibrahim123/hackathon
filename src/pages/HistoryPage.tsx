import { Link } from "react-router-dom";

export default function HistoryPage() {
  return (
    <main className="app-main">
      <h1 data-route-heading tabIndex={-1}>History</h1>
      <p>Receipt calculations save automatically. Manual calculations appear after you save them.</p>
      <Link to="/">Calculate a trip</Link>
    </main>
  );
}
