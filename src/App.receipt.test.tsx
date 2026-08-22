import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderHome } from "./test/renderHome";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("receipt calculation", () => {
  it("shows loading and renders the deterministic receipt result", async () => {
    const user = userEvent.setup();
    renderHome();

    const file = new File(["receipt"], "receipt.jpg", {
      type: "image/jpeg",
    });
    await user.upload(
      screen.getByLabelText("Receipt or grocery item image"),
      file,
    );
    await user.click(
      screen.getByRole("button", { name: "Calculate footprint" }),
    );

    expect(
      screen.getByText("Calculating your grocery footprint..."),
    ).toBeInTheDocument();

    expect(
      await screen.findByText("6.4 kg CO₂e", {}, { timeout: 1_500 }),
    ).toBeInTheDocument();
    expect(screen.getByText("Ground beef")).toBeInTheDocument();
    expect(screen.getByText("3.1 kg CO₂e")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Swap recommendations" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Ground beef → Lentils")).toBeInTheDocument();
  });
});
