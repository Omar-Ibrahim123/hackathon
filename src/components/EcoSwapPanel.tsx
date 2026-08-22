import { formatEmissions } from "../format";
import type { EcoSwapRecommendation } from "../types";

export default function EcoSwapPanel({
  recommendations,
}: {
  recommendations: EcoSwapRecommendation[];
}) {
  if (recommendations.length === 0) return null;

  return (
    <section className="eco-swap-panel" aria-labelledby="eco-swap-heading">
      <p className="eyebrow">Lower-impact alternatives</p>
      <h2 id="eco-swap-heading">Swap recommendations</h2>
      <ul className="eco-swap-list">
        {recommendations.map((recommendation) => (
          <li
            key={`${recommendation.originalItem}-${recommendation.recommendedSwap}`}
          >
            <strong>
              {recommendation.originalItem} → {recommendation.recommendedSwap}
            </strong>
            <span>
              Potential saving: {formatEmissions(recommendation.potentialSavingsKg)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
