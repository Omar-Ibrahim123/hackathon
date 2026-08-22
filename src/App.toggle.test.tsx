import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { renderHome } from "./test/renderHome";

afterEach(cleanup);

describe("grocery input method toggle", () => {
  it("defaults to receipt scanning and preserves both forms while switching", async () => {
    const user = userEvent.setup();
    renderHome();

    const receiptTab = screen.getByRole("tab", { name: "Scan receipt" });
    const manualTab = screen.getByRole("tab", { name: "Enter manually" });
    const receiptHeading = screen.getByRole("heading", {
      name: "Upload your grocery receipt",
    });
    const manualHeading = screen.getByRole("heading", {
      name: "Add groceries yourself",
      hidden: true,
    });

    expect(receiptTab).toHaveAttribute("aria-selected", "true");
    expect(receiptHeading).toBeVisible();
    expect(manualHeading).not.toBeVisible();

    await user.upload(
      screen.getByLabelText("Receipt image"),
      new File(["receipt"], "weekend-shop.jpg", { type: "image/jpeg" }),
    );

    await user.click(manualTab);
    expect(manualTab).toHaveAttribute("aria-selected", "true");
    expect(receiptHeading).not.toBeVisible();
    expect(manualHeading).toBeVisible();
    await user.type(screen.getByLabelText("Product name"), "Granola bars");

    await user.click(receiptTab);
    expect(screen.getByText("weekend-shop.jpg")).toBeVisible();

    await user.click(manualTab);
    expect(screen.getByLabelText("Product name")).toHaveValue("Granola bars");
  });
});
