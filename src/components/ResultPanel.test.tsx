import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import ResultPanel from "./ResultPanel";

afterEach(cleanup);

describe("ResultPanel", () => {
  it("visualizes each item's share in a labelled donut chart", () => {
    render(
      <ResultPanel
        result={{
          totalCo2eKg: 2.7,
          potentialTotalSavingsKg: 0,
          ecoSwapRecommendations: [],
          items: [
            { id: "granola", name: "Granola bars", co2eKg: 1.8 },
            { id: "apples", name: "Apples", co2eKg: 0.9 },
          ],
        }}
      />,
    );

    expect(
      screen.getByRole("img", { name: "Carbon emissions by grocery item" }),
    ).toBeInTheDocument();

    const legend = screen.getByLabelText("Carbon emissions legend");
    expect(within(legend).getByText("Granola bars")).toBeInTheDocument();
    expect(within(legend).getByText("1.8 kg CO₂e")).toBeInTheDocument();
    expect(within(legend).getByText("66.7%")).toBeInTheDocument();
    expect(within(legend).getByText("Apples")).toBeInTheDocument();
    expect(within(legend).getByText("0.9 kg CO₂e")).toBeInTheDocument();
    expect(within(legend).getByText("33.3%")).toBeInTheDocument();
  });
});
