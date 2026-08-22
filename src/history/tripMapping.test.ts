import { describe, expect, it } from "vitest";

import { toNewTrip } from "./tripMapping";

describe("toNewTrip", () => {
  it("maps a calculation without inventing persistence-owned fields", () => {
    const trip = toNewTrip(
      {
        totalCo2eKg: 6.4,
        potentialTotalSavingsKg: 2.69,
        items: [{ id: "beef", name: "Ground beef", co2eKg: 3.1 }],
        ecoSwapRecommendations: [
          {
            originalItem: "Ground beef",
            originalCo2eKg: 3.1,
            recommendedSwap: "Lentils",
            swapCo2eKg: 0.41,
            potentialSavingsKg: 2.69,
          },
        ],
      },
      "receipt",
    );

    expect(trip).toEqual({
      source: "receipt",
      totalCo2eKg: 6.4,
      items: [{ id: "beef", name: "Ground beef", co2eKg: 3.1 }],
      ecoSwapRecommendations: [
        {
          originalItem: "Ground beef",
          originalCo2eKg: 3.1,
          recommendedSwap: "Lentils",
          swapCo2eKg: 0.41,
          potentialSavingsKg: 2.69,
        },
      ],
    });
    expect(trip).not.toHaveProperty("id");
    expect(trip).not.toHaveProperty("savedAt");
  });
});
