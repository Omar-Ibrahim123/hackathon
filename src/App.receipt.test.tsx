import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "./App";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("receipt calculation", () => {
  it("shows loading and renders the deterministic receipt result", async () => {
    const user = userEvent.setup();
    render(<App />);

    const file = new File(["receipt"], "receipt.jpg", {
      type: "image/jpeg",
    });
    await user.upload(screen.getByLabelText("Receipt image"), file);
    await user.click(
      screen.getByRole("button", { name: "Calculate receipt" }),
    );

    expect(
      screen.getByText("Calculating your grocery footprint..."),
    ).toBeInTheDocument();

    expect(
      await screen.findByText("6.4 kg CO₂e", {}, { timeout: 1_500 }),
    ).toBeInTheDocument();
    expect(screen.getByText("Ground beef")).toBeInTheDocument();
    expect(screen.getByText("3.1 kg CO₂e")).toBeInTheDocument();
  });
});
