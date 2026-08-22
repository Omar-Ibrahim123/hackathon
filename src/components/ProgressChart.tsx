import { formatEmissions } from "../format";
import type { ProgressUpload } from "../history/progress";

export default function ProgressChart({ uploads }: { uploads: ProgressUpload[] }) {
  const max = Math.max(...uploads.map((upload) => upload.totalCo2eKg), 1);

  return (
    <figure
      className="progress-chart"
      role="img"
      aria-label="Carbon footprint by upload"
    >
      <div className="progress-bars" aria-hidden="true">
        {uploads.map((upload) => (
          <div className="progress-column" key={upload.id}>
            <strong>{formatEmissions(upload.totalCo2eKg)}</strong>
            <div className="progress-bar-track">
              <span
                className="progress-bar"
                style={{ height: `${(upload.totalCo2eKg / max) * 100}%` }}
              />
            </div>
            <span>{upload.label}</span>
          </div>
        ))}
      </div>
      <span className="visually-hidden">
        {uploads
          .map((upload) => `${upload.label}: ${formatEmissions(upload.totalCo2eKg)}`)
          .join("; ")}
      </span>
    </figure>
  );
}
