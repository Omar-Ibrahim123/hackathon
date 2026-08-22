import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <main className="app-main">
      <h1 data-route-heading tabIndex={-1}>Page not found</h1>
      <p>The page you requested does not exist.</p>
      <Link to="/">Return Home</Link>
    </main>
  );
}
