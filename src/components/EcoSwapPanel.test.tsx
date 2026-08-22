import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import EcoSwapPanel from "./EcoSwapPanel";


afterEach(cleanup);

const recommendations = [
  {
    originalItem: "Ground beef",
    originalCo2eKg: 3.1,
    recommendedSwap: "Lentils",
    swapCo2eKg: 0.41,
    potentialSavingsKg: 2.69,
  },
];

describe("EcoSwapPanel", () => {
  it("shows the recommended replacement and potential saving", () => {
    render(<EcoSwapPanel recommendations={recommendations} />);

    expect(
      screen.getByRole("heading", { name: "Swap recommendations" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Ground beef → Lentils")).toBeInTheDocument();
    expect(screen.getByText("Potential saving: 2.69 kg CO₂e"))
      .toBeInTheDocument();
  });

  it("renders nothing when no recommendation is available", () => {
    const { container } = render(<EcoSwapPanel recommendations={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
