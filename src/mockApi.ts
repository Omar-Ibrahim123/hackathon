import type { CarbonResult, ManualGroceryItem } from "./types";

const MOCK_DELAY_MS = 650;

const RECEIPT_RESULT: CarbonResult = {
  totalCo2eKg: 6.4,
  items: [
    { id: "beef", name: "Ground beef", co2eKg: 3.1 },
    { id: "cheese", name: "Cheddar cheese", co2eKg: 1.2 },
    { id: "oat-milk", name: "Oat milk", co2eKg: 0.5 },
    { id: "bread", name: "Bread", co2eKg: 0.4 },
    { id: "produce", name: "Produce", co2eKg: 1.2 },
  ],
};

const MANUAL_RESULT: CarbonResult = {
  totalCo2eKg: 2.7,
  items: [
    { id: "granola", name: "Granola bars", co2eKg: 1.8 },
    { id: "apples", name: "Apples", co2eKg: 0.9 },
  ],
};

function copyResult(result: CarbonResult): CarbonResult {
  return { ...result, items: result.items.map((item) => ({ ...item })) };
}

function delay(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, MOCK_DELAY_MS));
}

export async function mockAnalyzeReceipt(_file?: File): Promise<CarbonResult> {
  await delay();
  return copyResult(RECEIPT_RESULT);
}

export async function mockCalculateManual(
  _items?: ManualGroceryItem[],
): Promise<CarbonResult> {
  await delay();
  return copyResult(MANUAL_RESULT);
}
