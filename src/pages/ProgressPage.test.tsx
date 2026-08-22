import { cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { SavedTrip } from "../history/types";
import { MemoryTripRepository } from "../test/MemoryTripRepository";
import { renderApp } from "../test/renderApp";

function trip(id: string, day: number, total: number): SavedTrip {
  return {
    id,
    source: "receipt",
    savedAt: new Date(2026, 7, day, 12).toISOString(),
    totalCo2eKg: total,
    items: [],
  };
}

describe("ProgressPage", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(cleanup);

  it("shows insights based on the six most recent uploads", async () => {
    const trips = [
      trip("excluded", 1, 100),
      trip("one", 2, 2),
      trip("two", 3, 3),
      trip("three", 4, 4),
      trip("four", 5, 5),
      trip("previous", 6, 10),
      trip("latest-highest", 7, 15),
    ];
    renderApp({
      route: "/progress",
      repository: new MemoryTripRepository(trips),
      welcomeComplete: true,
    });

    expect(
      await screen.findByText("50% increase from previous upload"),
    ).toBeInTheDocument();
    expect(screen.getByText("6.5 kg CO₂e per upload")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Recent uploads" }))
      .toBeInTheDocument();
    expect(screen.getByRole("link", { name: /highest-impact upload/i }))
      .toHaveAttribute("href", "/history/latest-highest");
  });

  it("does not invent a percentage without a previous upload", async () => {
    renderApp({
      route: "/progress",
      repository: new MemoryTripRepository([trip("only", 2, 5)]),
      welcomeComplete: true,
    });

    expect(
      await screen.findByText("Not enough previous-upload data to compare"),
    ).toBeInTheDocument();
  });

  it("shows a constructive empty state", async () => {
    renderApp({ route: "/progress", welcomeComplete: true });

    expect(
      await screen.findByText(/save your first trip to see progress/i),
    ).toBeInTheDocument();
  });
});
