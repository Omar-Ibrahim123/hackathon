import type { ManualGroceryItem } from "./types";

type ValidationResult = { ok: true } | { ok: false; message: string };

const ACCEPTED_RECEIPT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
]);

const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

export function validateReceiptFile(file: File): ValidationResult {
  if (!ACCEPTED_RECEIPT_TYPES.has(file.type)) {
    return {
      ok: false,
      message: "Choose a JPG, PNG, HEIC, or WebP image.",
    };
  }

  if (file.size > MAX_RECEIPT_BYTES) {
    return {
      ok: false,
      message: "Choose an image smaller than 10 MB.",
    };
  }

  return { ok: true };
}

export function validateManualItem(item: ManualGroceryItem): ValidationResult {
  if (!item.name.trim()) {
    return { ok: false, message: "Enter an item name." };
  }

  if (item.type === "packaged" && !item.category.trim()) {
    return { ok: false, message: "Choose a grocery category." };
  }

  if (!Number.isFinite(item.priceCad) || item.priceCad <= 0) {
    return { ok: false, message: "Enter a price greater than $0." };
  }

  if (
    item.type === "packaged" &&
    (!Number.isInteger(item.quantity) || item.quantity <= 0)
  ) {
    return {
      ok: false,
      message: "Enter a whole-number quantity greater than 0.",
    };
  }

  return { ok: true };
}
