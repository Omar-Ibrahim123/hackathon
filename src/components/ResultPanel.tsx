import type { CarbonResult } from "../types";
import { formatEmissions } from "../format";

interface ResultPanelProps {
  result: CarbonResult;
}

const CHART_RADIUS = 42;
const CHART_CIRCUMFERENCE = 2 * Math.PI * CHART_RADIUS;
const CHART_COLOURS = [
  "#f6b26b",
  "#7fd1ae",
  "#73b7e8",
  "#c29ae8",
  "#e7cf67",
  "#ef8b82",
  "#88d7dc",
  "#dca0ba",
];

export default function ResultPanel({ result }: ResultPanelProps) {
  const itemTotal = result.items.reduce((total, item) => total + item.co2eKg, 0);
  let travelled = 0;
  const slices = result.items.map((item, index) => {
    const share = itemTotal > 0 ? item.co2eKg / itemTotal : 0;
    const slice = {
      ...item,
      colour: CHART_COLOURS[index % CHART_COLOURS.length],
      dashLength: share * CHART_CIRCUMFERENCE,
      dashOffset: -travelled,
      percentage: `${(share * 100).toFixed(1)}%`,
    };
    travelled += slice.dashLength;
    return slice;
  });

  return (
    <section className="result-panel" aria-labelledby="result-heading">
      <div className="result-summary">
        <p className="eyebrow result-eyebrow">Calculation complete</p>
        <h2 id="result-heading">Your grocery footprint</h2>
      </div>

      <div className="result-visual">
        <div className="donut-shell">
          <svg
            className="donut-chart"
            viewBox="0 0 120 120"
            role="img"
            aria-label="Carbon emissions by grocery item"
          >
            <title>Carbon emissions by grocery item</title>
            <circle
              className="donut-track"
              cx="60"
              cy="60"
              r={CHART_RADIUS}
            />
            {slices.map((slice) => (
              <circle
                className="donut-segment"
                key={slice.id}
                cx="60"
                cy="60"
                r={CHART_RADIUS}
                stroke={slice.colour}
                strokeDasharray={`${slice.dashLength} ${CHART_CIRCUMFERENCE}`}
                strokeDashoffset={slice.dashOffset}
              />
            ))}
          </svg>
          <div className="donut-total" aria-hidden="true">
            <span>Total emissions</span>
            <strong>{formatEmissions(result.totalCo2eKg)}</strong>
          </div>
        </div>

        <ul className="chart-legend" aria-label="Carbon emissions legend">
          {slices.map((slice) => (
            <li key={slice.id}>
              <span
                className="legend-swatch"
                style={{ backgroundColor: slice.colour }}
                aria-hidden="true"
              />
              <span className="legend-item-name">{slice.name}</span>
              <strong>{formatEmissions(slice.co2eKg)}</strong>
              <span className="legend-percentage">{slice.percentage}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
