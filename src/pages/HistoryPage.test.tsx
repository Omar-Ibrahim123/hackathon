import { cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { SavedTrip } from "../history/types";
import { MemoryTripRepository } from "../test/MemoryTripRepository";
import { renderApp } from "../test/renderApp";

const olderTrip: SavedTrip = {
  id: "older",
  source: "manual",
  savedAt: "2026-07-20T12:00:00.000Z",
  totalCo2eKg: 2.7,
  items: [{ id: "apples", name: "Apples", co2eKg: 0.9 }],
};
const newerTrip: SavedTrip = {
  id: "newer",
  source: "receipt",
  savedAt: "2026-08-20T12:00:00.000Z",
  totalCo2eKg: 6.4,
  items: [{ id: "beef", name: "Ground beef", co2eKg: 3.1 }],
};

describe("HistoryPage", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(cleanup);

  it("lists saved trips newest first without analytics or search", async () => {
    renderApp({
      route: "/history",
      repository: new MemoryTripRepository([olderTrip, newerTrip]),
      welcomeComplete: true,
    });

    const links = await screen.findAllByRole("link", { name: /trip/i });
    expect(links[0]).toHaveAttribute("href", "/history/newer");
    expect(links[1]).toHaveAttribute("href", "/history/older");
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.queryByText(/previous month/i)).not.toBeInTheDocument();
  });

  it("explains how an empty history is populated", async () => {
    renderApp({ route: "/history", welcomeComplete: true });

    expect(
      await screen.findByText(/receipt calculations save automatically/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/manual calculations appear after you save them/i),
    ).toBeInTheDocument();
  });

  it("shows a controlled load failure", async () => {
    renderApp({
      route: "/history",
      repository: new MemoryTripRepository(
        [],
        "Unable to access saved trip history.",
      ),
      welcomeComplete: true,
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to access saved trip history.",
    );
  });
});
