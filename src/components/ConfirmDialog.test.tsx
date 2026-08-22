import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import ConfirmDialog from "./ConfirmDialog";

afterEach(cleanup);

describe("ConfirmDialog", () => {
  it("focuses cancel and contains keyboard focus", async () => {
    const user = userEvent.setup();
    render(
      <ConfirmDialog
        open
        title="Delete this trip?"
        description="This cannot be undone."
        confirmLabel="Delete permanently"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    const cancel = screen.getByRole("button", { name: "Keep trip" });
    const confirm = screen.getByRole("button", { name: "Delete permanently" });
    expect(cancel).toHaveFocus();
    await user.tab({ shift: true });
    expect(confirm).toHaveFocus();
    await user.tab();
    expect(cancel).toHaveFocus();
  });
});
