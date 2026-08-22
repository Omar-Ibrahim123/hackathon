import { useNavigate } from "react-router-dom";

import { completeWelcome } from "../welcome/welcomePreference";

export default function WelcomePage() {
  const navigate = useNavigate();

  function startTracking() {
    completeWelcome();
    navigate("/", { replace: true });
  }

  return (
    <main className="welcome-page">
      <section className="welcome-card">
        <p className="eyebrow">Your grocery carbon companion</p>
        <h1 data-route-heading tabIndex={-1}>Welcome to EcoReceipt</h1>
        <p>
          Scan a receipt or enter groceries manually to see the footprint of
          your trip and each item.
        </p>
        <p>
          Your progress is saved in this browser for now. No account is
          required.
        </p>
        <button className="primary-button" type="button" onClick={startTracking}>
          <span>Start tracking</span>
          <span aria-hidden="true">→</span>
        </button>
      </section>
    </main>
  );
}
