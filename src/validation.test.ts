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
  it("accepts a product with a name, positive price, and quantity", () => {
    expect(
      validateManualItem({
        id: "1",
        type: "product",
        name: "Apples",
        priceCad: 4.5,
        quantity: 1,
      }),
    ).toEqual({ ok: true });
  });

  it("rejects a non-positive price", () => {
    expect(
      validateManualItem({
        id: "2",
        type: "product",
        name: "Apples",
        priceCad: 0,
        quantity: 1,
      }),
    ).toEqual({
      ok: false,
      message: "Enter a price greater than $0.",
    });
  });

  it("rejects a product with a non-positive quantity", () => {
    expect(
      validateManualItem({
        id: "3",
        type: "product",
        name: "Granola bars",
        priceCad: 5,
        quantity: 0,
      }),
    ).toEqual({
      ok: false,
      message: "Enter a whole-number quantity greater than 0.",
    });
  });
});
