import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import ProgressChart from "./ProgressChart";

afterEach(cleanup);

describe("ProgressChart", () => {
  it("labels every upload bar with its date and value", () => {
    render(
      <ProgressChart
        uploads={[
          { id: "one", label: "Aug 20", totalCo2eKg: 10 },
          { id: "two", label: "Aug 22", totalCo2eKg: 15 },
        ]}
      />,
    );

    expect(
      screen.getByRole("img", { name: "Carbon footprint by upload" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Aug 20")).toBeInTheDocument();
    expect(screen.getByText("10 kg CO₂e")).toBeInTheDocument();
    expect(screen.getByText("Aug 22")).toBeInTheDocument();
    expect(screen.getByText("15 kg CO₂e")).toBeInTheDocument();
  });
});
