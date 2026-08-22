import { formatEmissions } from "../format";
import type { ProgressMonth } from "../history/progress";

export default function ProgressChart({ months }: { months: ProgressMonth[] }) {
  const max = Math.max(...months.map((month) => month.totalCo2eKg), 1);

  return (
    <figure
      className="progress-chart"
      role="img"
      aria-label="Monthly carbon footprint"
    >
      <div className="progress-bars" aria-hidden="true">
        {months.map((month) => (
          <div className="progress-column" key={month.key}>
            <strong>{formatEmissions(month.totalCo2eKg)}</strong>
            <div className="progress-bar-track">
              <span
                className="progress-bar"
                style={{ height: `${(month.totalCo2eKg / max) * 100}%` }}
              />
            </div>
            <span>{month.label}</span>
          </div>
        ))}
      </div>
      <span className="visually-hidden">
        {months
          .map((month) => `${month.label}: ${formatEmissions(month.totalCo2eKg)}`)
          .join("; ")}
      </span>
    </figure>
  );
}
