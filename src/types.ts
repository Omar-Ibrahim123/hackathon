export interface CarbonResultItem {
  id: string;
  name: string;
  co2eKg: number;
}

export interface CarbonResult {
  totalCo2eKg: number;
  items: CarbonResultItem[];
}

export type ApiMode = "mock" | "live";

export type ManualGroceryItem =
  | {
      id: string;
      type: "packaged";
      name: string;
      category: string;
      priceCad: number;
      quantity: number;
    }
  | {
      id: string;
      type: "produce";
      name: string;
      priceCad: number;
    };

export interface ManualCalculationRequest {
  region: "CA";
  currency: "CAD";
  items: ManualGroceryItem[];
}

