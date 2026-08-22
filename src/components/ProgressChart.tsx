import { useState, type CSSProperties } from "react";

import { formatEmissions } from "../format";
import type { ProgressUpload } from "../history/progress";

/** Rounds the axis ceiling up to 4 steps of a "nice" size (1/2/2.5/5 × 10^n). */
function niceCeiling(dataMax: number): number {
  const rawStep = dataMax / 4;
  const pow = 10 ** Math.floor(Math.log10(rawStep));
  const frac = rawStep / pow;
  const niceStep =
    pow * (frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 2.5 ? 2.5 : frac <= 5 ? 5 : 10);
  const top = 4 * niceStep;
  return Number.isFinite(top) && top > 0 ? top : 4;
}

/** Enough decimals that consecutive ticks a step apart never collide. */
function tickDecimals(step: number): number {
  if (step >= 1) return 2;
  return Math.min(6, Math.ceil(-Math.log10(step)) + 1);
}

export default function ProgressChart({ uploads }: { uploads: ProgressUpload[] }) {
  const [tableOpen, setTableOpen] = useState(false);
  const top = niceCeiling(Math.max(...uploads.map((u) => u.totalCo2eKg), 0.001));
  const decimals = tickDecimals(top / 4);
  const latestId = uploads.at(-1)?.id;
  // ">=" keeps the most recent of tied maxima, matching highestImpactTrip.
  const peak = uploads.reduce(
    (highest, upload) =>
      upload.totalCo2eKg >= highest.totalCo2eKg ? upload : highest,
    uploads[0],
  );

  return (
    <>
      <figure
        className="progress-chart"
        role="img"
        aria-label="Carbon footprint by upload"
      >
        <div className="chart-frame" aria-hidden="true">
          <div className="chart-plot">
            {[4, 3, 2, 1, 0].map((step) => (
              <div
                className={`gridline${step === 0 ? " gridline-base" : ""}`}
                style={{ bottom: `${step * 25}%` }}
                key={step}
              >
                <span className="tick-label">
                  {((top / 4) * step).toLocaleString("en-CA", {
                    maximumFractionDigits: decimals,
                  })}
                </span>
              </div>
            ))}
            <div className="chart-cols">
              {uploads.map((upload, index) => {
                const pct = Math.min((upload.totalCo2eKg / top) * 100, 100);
                const isLatest = upload.id === latestId;
                const isPeak =
                  uploads.length > 1 && upload.id === peak.id && !isLatest;
                return (
                  <div className="chart-col" key={upload.id}>
                    {(isLatest || isPeak) && (
                      <span
                        className="col-annot"
                        style={{ bottom: `calc(${pct}% + 8px)` }}
                      >
                        {isLatest && <span className="annot-tag">Latest</span>}
                        <span className={`annot-value${isPeak ? " annot-muted" : ""}`}>
                          {upload.totalCo2eKg.toLocaleString("en-CA", {
                            maximumFractionDigits: 1,
                          })}
                        </span>
                      </span>
                    )}
                    <span
                      className={`bar${isLatest ? " bar-latest" : ""}`}
                      style={{ height: `${pct}%`, "--i": index } as CSSProperties}
                    />
                    <span
                      className="bar-tip"
                      style={{ bottom: `calc(${pct}% + 10px)` }}
                    >
                      <strong>{formatEmissions(upload.totalCo2eKg)}</strong>
                      <span>· {upload.label}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="chart-xlabels">
            {uploads.map((upload) => (
              <span
                className={`xlabel${upload.id === latestId ? " xlabel-latest" : ""}`}
                key={upload.id}
              >
                {upload.label}
              </span>
            ))}
          </div>
        </div>
        <span className="visually-hidden">
          {uploads
            .map((upload) => `${upload.label}: ${formatEmissions(upload.totalCo2eKg)}`)
            .join("; ")}
        </span>
      </figure>
      <details
        className="chart-table"
        onToggle={(event) => setTableOpen(event.currentTarget.open)}
      >
        <summary>View data as table</summary>
        {tableOpen && (
          <table>
            <thead>
              <tr>
                <th scope="col">Upload</th>
                <th scope="col">Footprint</th>
              </tr>
            </thead>
            <tbody>
              {uploads.map((upload) => (
                <tr key={upload.id}>
                  <td>{upload.label}</td>
                  <td>{formatEmissions(upload.totalCo2eKg)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </details>
    </>
  );
}
