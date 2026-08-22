import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { MemoryTripRepository } from "./test/MemoryTripRepository";
import { renderHome } from "./test/renderHome";

afterEach(cleanup);

async function calculateReceipt(user: ReturnType<typeof userEvent.setup>) {
  await user.upload(
    screen.getByLabelText("Receipt or grocery item image"),
    new File(["receipt"], "receipt.jpg", { type: "image/jpeg" }),
  );
  await user.click(screen.getByRole("button", { name: "Calculate footprint" }));
}

async function calculateOneManualItem(
  user: ReturnType<typeof userEvent.setup>,
) {
  await user.click(screen.getByRole("tab", { name: "Enter manually" }));
  await user.type(screen.getByLabelText("Product name"), "Granola bars");
  await user.type(screen.getByLabelText("Price (CAD)"), "5");
  await user.type(screen.getByLabelText("Quantity"), "1");
  await user.click(screen.getByRole("button", { name: "Add item" }));
  await user.click(
    screen.getByRole("button", { name: "Calculate manual groceries" }),
  );
}

describe("Home history saving", () => {
  it("automatically saves one receipt trip after calculation", async () => {
    const repository = new MemoryTripRepository();
    const user = userEvent.setup();
    renderHome({ repository });

    await calculateReceipt(user);
    expect(
      await screen.findByText("Saved to history", {}, { timeout: 1_500 }),
    ).toBeInTheDocument();
    expect(repository.savedInputs).toEqual([
      expect.objectContaining({ source: "receipt", totalCo2eKg: 6.4 }),
    ]);
  });

  it("requires one explicit save for a manual result", async () => {
    const repository = new MemoryTripRepository();
    const user = userEvent.setup();
    renderHome({ repository });

    await calculateOneManualItem(user);
    await screen.findByText("2.7 kg CO₂e", {}, { timeout: 1_500 });
    expect(repository.savedInputs).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Save to history" }));

    expect(repository.savedInputs).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Saved" })).toBeDisabled();
  });

  it("keeps the receipt result visible when automatic saving fails", async () => {
    const repository = new MemoryTripRepository(
      [],
      "Unable to save trip history.",
    );
    const user = userEvent.setup();
    renderHome({ repository });

    await calculateReceipt(user);

    expect(
      await screen.findByText("6.4 kg CO₂e", {}, { timeout: 1_500 }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Unable to save trip history."),
    ).toBeInTheDocument();
  });
});
