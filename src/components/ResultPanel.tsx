import type { CarbonResult } from "../types";

interface ResultPanelProps {
  result: CarbonResult;
}

function formatEmissions(value: number): string {
  return `${value.toLocaleString("en-CA", { maximumFractionDigits: 2 })} kg CO₂e`;
}

export default function ResultPanel({ result }: ResultPanelProps) {
  return (
    <section className="result-panel" aria-labelledby="result-heading">
      <div className="result-summary">
        <div>
          <p className="eyebrow result-eyebrow">Calculation complete</p>
          <h2 id="result-heading">Your grocery footprint</h2>
        </div>
        <div className="total-emissions">
          <span>Total carbon emissions</span>
          <strong>{formatEmissions(result.totalCo2eKg)}</strong>
        </div>
      </div>

      <ul className="result-list" aria-label="Item carbon emissions">
        {result.items.map((item) => (
          <li key={item.id}>
            <span>{item.name}</span>
            <strong>{formatEmissions(item.co2eKg)}</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}
