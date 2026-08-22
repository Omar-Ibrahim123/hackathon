import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import App from "./App";

afterEach(cleanup);

describe("manual grocery calculation", () => {
  it("builds a packaged and produce list before rendering item emissions", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText("Product name"), "Granola bars");
    await user.selectOptions(
      screen.getByLabelText("Grocery category"),
      "Snacks and sweets",
    );
    await user.type(screen.getByLabelText("Price (CAD)"), "5");
    await user.type(screen.getByLabelText("Quantity"), "1");
    await user.click(screen.getByRole("button", { name: "Add item" }));

    await user.click(screen.getByRole("radio", { name: "Produce" }));
    expect(screen.queryByLabelText("Grocery category")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Quantity")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/brand/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/weight/i)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Produce name"), "Apples");
    await user.type(screen.getByLabelText("Price (CAD)"), "4.50");
    await user.click(screen.getByRole("button", { name: "Add item" }));

    await user.click(
      screen.getByRole("button", { name: "Calculate manual groceries" }),
    );
    expect(
      screen.getByText("Calculating your grocery footprint..."),
    ).toBeInTheDocument();

    expect(
      await screen.findByText("2.7 kg CO₂e", {}, { timeout: 1_500 }),
    ).toBeInTheDocument();
    expect(screen.getByText("1.8 kg CO₂e")).toBeInTheDocument();
    expect(screen.getByText("0.9 kg CO₂e")).toBeInTheDocument();
    expect(screen.getAllByText("Granola bars").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Apples").length).toBeGreaterThan(0);
  });
});
