import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { SavedTrip } from "../history/types";
import { MemoryTripRepository } from "../test/MemoryTripRepository";
import { renderApp } from "../test/renderApp";

const savedTrip: SavedTrip = {
  id: "receipt-trip",
  source: "receipt",
  savedAt: "2026-08-20T12:00:00.000Z",
  totalCo2eKg: 6.4,
  ecoSwapRecommendations: [],
  items: [{ id: "beef", name: "Ground beef", co2eKg: 3.1 }],
};

describe("TripDetailsPage", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(cleanup);

  it("renders source, total, and items without edit controls", async () => {
    renderApp({
      route: `/history/${savedTrip.id}`,
      repository: new MemoryTripRepository([savedTrip]),
      welcomeComplete: true,
    });

    expect(
      await screen.findByRole("heading", { name: "Trip details" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Ground beef")).toBeInTheDocument();
    expect(screen.getByText("6.4 kg CO₂e")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
  });

  it("cancels deletion without changing history", async () => {
    const user = userEvent.setup();
    const repository = new MemoryTripRepository([savedTrip]);
    renderApp({
      route: `/history/${savedTrip.id}`,
      repository,
      welcomeComplete: true,
    });
    const trigger = await screen.findByRole("button", { name: "Delete trip" });

    await user.click(trigger);
    expect(
      screen.getByRole("dialog", { name: "Delete this trip?" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep trip" }));

    expect(repository.deletedIds).toEqual([]);
    expect(trigger).toHaveFocus();
  });

  it("confirms deletion and returns to History", async () => {
    const user = userEvent.setup();
    const repository = new MemoryTripRepository([savedTrip]);
    renderApp({
      route: `/history/${savedTrip.id}`,
      repository,
      welcomeComplete: true,
    });
    await user.click(await screen.findByRole("button", { name: "Delete trip" }));
    await user.click(screen.getByRole("button", { name: "Delete permanently" }));

    expect(repository.deletedIds).toEqual([savedTrip.id]);
    expect(
      await screen.findByRole("heading", { name: "History" }),
    ).toBeInTheDocument();
  });

  it("recovers when a trip id is missing", async () => {
    renderApp({ route: "/history/missing", welcomeComplete: true });

    expect(
      await screen.findByRole("heading", { name: "Trip not found" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to History" }))
      .toHaveAttribute("href", "/history");
  });
});
