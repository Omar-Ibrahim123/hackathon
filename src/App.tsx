import { useState } from "react";

import { analyzeReceipt } from "./api";
import ReceiptInput from "./components/ReceiptInput";
import ResultPanel from "./components/ResultPanel";
import type { CarbonResult } from "./types";

type Request = () => Promise<CarbonResult>;

export default function App() {
  const [result, setResult] = useState<CarbonResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRequest, setLastRequest] = useState<Request | null>(null);

  async function runRequest(request: Request) {
    setLastRequest(() => request);
    setIsLoading(true);
    setError(null);
    try {
      setResult(await request());
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to calculate your groceries right now.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="page-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="GreenerCart home">
          <span className="brand-mark" aria-hidden="true">G</span>
          GreenerCart
        </a>
        <span className="demo-pill">Demo mode</span>
      </header>

      <main id="top">
        <section className="hero">
          <p className="eyebrow">Know the impact of what you buy</p>
          <h1>Turn your grocery list into a clearer carbon picture.</h1>
          <p className="hero-copy">
            Upload a receipt or enter your groceries. GreenerCart returns a
            simple footprint for the whole shop and every item in it.
          </p>
        </section>

        <div className="input-grid">
          <ReceiptInput
            disabled={isLoading}
            onSubmit={(file) => void runRequest(() => analyzeReceipt(file))}
          />
        </div>

        {isLoading && (
          <div className="status-card" role="status" aria-live="polite">
            <span className="spinner" aria-hidden="true" />
            Calculating your grocery footprint...
          </div>
        )}

        {error && (
          <div className="error-card" role="alert">
            <div>
              <strong>We couldn’t complete that calculation.</strong>
              <p>{error}</p>
            </div>
            {lastRequest && (
              <button type="button" onClick={() => void runRequest(lastRequest)}>
                Try again
              </button>
            )}
          </div>
        )}

        {result && !isLoading && <ResultPanel result={result} />}
      </main>

      <footer>
        <span>GreenerCart</span>
        <span>Made for smarter grocery choices.</span>
      </footer>
    </div>
  );
}
