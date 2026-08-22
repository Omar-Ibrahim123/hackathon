import { useState } from "react";

import { analyzeReceipt, calculateManual } from "../api";
import ManualEntryForm from "../components/ManualEntryForm";
import ReceiptInput from "../components/ReceiptInput";
import ResultPanel from "../components/ResultPanel";
import { useTripRepository } from "../history/TripRepositoryContext";
import { toNewTrip } from "../history/tripMapping";
import type { SavedTrip, TripSource } from "../history/types";
import type { CarbonResult } from "../types";

type Request = () => Promise<CarbonResult>;
type InputMode = "receipt" | "manual";
interface ActiveResult {
  source: TripSource;
  result: CarbonResult;
}
interface LastRequest {
  source: TripSource;
  request: Request;
}

export default function HomePage() {
  const repository = useTripRepository();
  const [inputMode, setInputMode] = useState<InputMode>("receipt");
  const [activeResult, setActiveResult] = useState<ActiveResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRequest, setLastRequest] = useState<LastRequest | null>(null);
  const [savedTrip, setSavedTrip] = useState<SavedTrip | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function saveResult(result: CarbonResult, source: TripSource) {
    setIsSaving(true);
    setSaveError(null);
    try {
      setSavedTrip(await repository.saveTrip(toNewTrip(result, source)));
    } catch (saveFailure) {
      setSaveError(
        saveFailure instanceof Error
          ? saveFailure.message
          : "Unable to save trip history.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function runRequest(source: TripSource, request: Request) {
    setLastRequest({ source, request });
    setIsLoading(true);
    setError(null);
    setSaveError(null);
    setSavedTrip(null);
    try {
      const result = await request();
      setActiveResult({ source, result });
      if (source === "receipt") {
        await saveResult(result, source);
      }
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

  function clearManualSearch() {
    setActiveResult(null);
    setError(null);
    setLastRequest(null);
    setSavedTrip(null);
    setSaveError(null);
  }

  return (
    <main id="top">
      <section className="hero">
        <p className="eyebrow">Know the impact of what you buy</p>
        <h1 data-route-heading tabIndex={-1}>
          Turn your grocery list into a clearer carbon picture.
        </h1>
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
              onSubmit={(file) =>
                void runRequest("receipt", () => analyzeReceipt(file))
              }
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
              onClear={clearManualSearch}
              onSubmit={(items) =>
                void runRequest("manual", () => calculateManual(items))
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
            <button
              type="button"
              onClick={() =>
                void runRequest(lastRequest.source, lastRequest.request)
              }
            >
              Try again
            </button>
          )}
        </div>
      )}

      {activeResult && !isLoading && (
        <>
          <ResultPanel result={activeResult.result} />
          <div className="save-actions" aria-live="polite">
            {activeResult.source === "receipt" && savedTrip && (
              <p className="save-success">Saved to history</p>
            )}
            {activeResult.source === "manual" && (
              <button
                className="primary-button save-button"
                type="button"
                disabled={isSaving || savedTrip !== null}
                onClick={() =>
                  void saveResult(activeResult.result, activeResult.source)
                }
              >
                <span>{savedTrip ? "Saved" : isSaving ? "Saving..." : "Save to history"}</span>
                <span aria-hidden="true">→</span>
              </button>
            )}
          </div>
          {saveError && <p className="field-error save-error" role="alert">{saveError}</p>}
        </>
      )}
    </main>
  );
}
