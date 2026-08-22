import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import ProgressChart from "./ProgressChart";

afterEach(cleanup);

describe("ProgressChart", () => {
  it("labels every monthly bar with its value", () => {
    render(
      <ProgressChart
        months={[
          { key: "2026-07", label: "Jul", totalCo2eKg: 10 },
          { key: "2026-08", label: "Aug", totalCo2eKg: 15 },
        ]}
      />,
    );

    expect(
      screen.getByRole("img", { name: "Monthly carbon footprint" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Jul")).toBeInTheDocument();
    expect(screen.getByText("10 kg CO₂e")).toBeInTheDocument();
    expect(screen.getByText("Aug")).toBeInTheDocument();
    expect(screen.getByText("15 kg CO₂e")).toBeInTheDocument();
  });
});
