import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { renderApp } from "./test/renderApp";
import { WELCOME_STORAGE_KEY } from "./welcome/welcomePreference";

describe("application routing", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(cleanup);

  it("shows welcome once and opens Home after completion", async () => {
    const user = userEvent.setup();
    renderApp({ route: "/" });

    expect(
      screen.getByRole("heading", { name: /welcome to ecoreceipt/i }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Start tracking" }));

    expect(window.localStorage.getItem(WELCOME_STORAGE_KEY)).toBe("true");
    expect(
      screen.getByRole("heading", {
        name: "Turn your grocery list into a clearer carbon picture.",
      }),
    ).toBeInTheDocument();
  });

  it("lets returning users navigate among product pages", async () => {
    const user = userEvent.setup();
    renderApp({ route: "/", welcomeComplete: true });

    await user.click(screen.getByRole("link", { name: "History" }));
    expect(screen.getByRole("heading", { name: "History" })).toHaveFocus();
    await user.click(
      screen.getByRole("link", { name: "Progress & Insights" }),
    );
    expect(
      screen.getByRole("heading", { name: "Progress & Insights" }),
    ).toBeInTheDocument();
  });

  it("presents the EcoReceipt brand and all three grocery input options", () => {
    renderApp({ route: "/", welcomeComplete: true });

    const homeLink = screen.getByRole("link", { name: "EcoReceipt home" });
    expect(homeLink).toContainElement(
      screen.getByRole("img", { name: "EcoReceipt" }),
    );
    expect(
      screen.getByText(
        "Upload a receipt, take a picture, or enter your groceries. EcoReceipt returns a simple footprint for the whole shop and every item in it.",
      ),
    ).toBeInTheDocument();
  });

  it("recovers from unknown routes", () => {
    renderApp({ route: "/missing", welcomeComplete: true });
    expect(
      screen.getByRole("heading", { name: "Page not found" }),
    ).toBeInTheDocument();
  });
});
