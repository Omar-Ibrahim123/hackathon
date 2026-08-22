import { describe, expect, it } from "vitest";

import { toNewTrip } from "./tripMapping";

describe("toNewTrip", () => {
  it("maps a calculation without inventing persistence-owned fields", () => {
    const trip = toNewTrip(
      {
        totalCo2eKg: 6.4,
        items: [{ id: "beef", name: "Ground beef", co2eKg: 3.1 }],
      },
      "receipt",
    );

    expect(trip).toEqual({
      source: "receipt",
      totalCo2eKg: 6.4,
      items: [{ id: "beef", name: "Ground beef", co2eKg: 3.1 }],
    });
    expect(trip).not.toHaveProperty("id");
    expect(trip).not.toHaveProperty("savedAt");
  });
});
