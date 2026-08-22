import { useState } from "react";

import { analyzeReceipt, calculateManual } from "./api";
import ManualEntryForm from "./components/ManualEntryForm";
import ReceiptInput from "./components/ReceiptInput";
import ResultPanel from "./components/ResultPanel";
import type { CarbonResult } from "./types";

type Request = () => Promise<CarbonResult>;
type InputMode = "receipt" | "manual";

export default function App() {
  const [inputMode, setInputMode] = useState<InputMode>("receipt");
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

        <div className="input-method-shell">
          <div
            className="input-method-switcher"
            role="tablist"
            aria-label="Grocery input method"
          >
            <button
              id="receipt-input-tab"
              type="button"
              role="tab"
              aria-controls="receipt-input-panel"
              aria-selected={inputMode === "receipt"}
              disabled={isLoading}
              onClick={() => setInputMode("receipt")}
            >
              Scan receipt
            </button>
            <button
              id="manual-input-tab"
              type="button"
              role="tab"
              aria-controls="manual-input-panel"
              aria-selected={inputMode === "manual"}
              disabled={isLoading}
              onClick={() => setInputMode("manual")}
            >
              Enter manually
            </button>
          </div>

          <div className="input-stage">
            <div
              id="receipt-input-panel"
              role="tabpanel"
              aria-labelledby="receipt-input-tab"
              hidden={inputMode !== "receipt"}
            >
              <ReceiptInput
                disabled={isLoading}
                onSubmit={(file) => void runRequest(() => analyzeReceipt(file))}
              />
            </div>
            <div
              id="manual-input-panel"
              role="tabpanel"
              aria-labelledby="manual-input-tab"
              hidden={inputMode !== "manual"}
            >
              <ManualEntryForm
                disabled={isLoading}
                onSubmit={(items) =>
                  void runRequest(() => calculateManual(items))
                }
              />
            </div>
          </div>
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
