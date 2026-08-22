import { describe, expect, it } from "vitest";

import { validateManualItem, validateReceiptFile } from "./validation";

describe("validateReceiptFile", () => {
  it("accepts grocery receipt images", () => {
    expect(
      validateReceiptFile(
        new File(["x"], "receipt.jpg", { type: "image/jpeg" }),
      ),
    ).toEqual({ ok: true });
  });

  it("rejects unsupported receipt files", () => {
    expect(
      validateReceiptFile(
        new File(["x"], "receipt.pdf", { type: "application/pdf" }),
      ),
    ).toEqual({
      ok: false,
      message: "Choose a JPG, PNG, HEIC, or WebP image.",
    });
  });
});

describe("validateManualItem", () => {
  it("accepts produce with a name and positive price", () => {
    expect(
      validateManualItem({
        id: "1",
        type: "produce",
        name: "Apples",
        priceCad: 4.5,
      }),
    ).toEqual({ ok: true });
  });

  it("rejects a non-positive price", () => {
    expect(
      validateManualItem({
        id: "2",
        type: "produce",
        name: "Apples",
        priceCad: 0,
      }),
    ).toEqual({
      ok: false,
      message: "Enter a price greater than $0.",
    });
  });

  it("rejects a packaged product with a non-positive quantity", () => {
    expect(
      validateManualItem({
        id: "3",
        type: "packaged",
        name: "Granola bars",
        category: "Snacks and sweets",
        priceCad: 5,
        quantity: 0,
      }),
    ).toEqual({
      ok: false,
      message: "Enter a whole-number quantity greater than 0.",
    });
  });
});
