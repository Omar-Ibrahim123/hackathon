import { cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { SavedTrip } from "../history/types";
import { MemoryTripRepository } from "../test/MemoryTripRepository";
import { renderApp } from "../test/renderApp";

function dateForOffset(monthOffset: number, day: number): string {
  const now = new Date();
  return new Date(
    now.getFullYear(),
    now.getMonth() + monthOffset,
    day,
    12,
  ).toISOString();
}

function trip(id: string, monthOffset: number, day: number, total: number): SavedTrip {
  return {
    id,
    source: "receipt",
    savedAt: dateForOffset(monthOffset, day),
    totalCo2eKg: total,
    items: [],
  };
}

describe("ProgressPage", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(cleanup);

  it("shows six-month insights from saved trips", async () => {
    const trips = [
      trip("previous-a", -1, 3, 4),
      trip("previous-b", -1, 20, 6),
      trip("highest", 0, 2, 15),
      trip("oldest", -5, 10, 2),
    ];
    renderApp({
      route: "/progress",
      repository: new MemoryTripRepository(trips),
      welcomeComplete: true,
    });

    expect(
      await screen.findByText("50% increase from last month"),
    ).toBeInTheDocument();
    expect(screen.getByText("6.75 kg CO₂e per trip")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /highest-impact trip/i }))
      .toHaveAttribute("href", "/history/highest");
  });

  it("does not invent a percentage when the previous month is zero", async () => {
    renderApp({
      route: "/progress",
      repository: new MemoryTripRepository([trip("current", 0, 2, 5)]),
      welcomeComplete: true,
    });

    expect(
      await screen.findByText("Not enough previous-month data to compare"),
    ).toBeInTheDocument();
  });

  it("shows a constructive empty state", async () => {
    renderApp({ route: "/progress", welcomeComplete: true });

    expect(
      await screen.findByText(/save your first trip to see progress/i),
    ).toBeInTheDocument();
  });
});
