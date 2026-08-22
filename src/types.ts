export interface CarbonResultItem {
  id: string;
  name: string;
  co2eKg: number;
}

export interface EcoSwapRecommendation {
  originalItem: string;
  originalCo2eKg: number;
  recommendedSwap: string;
  swapCo2eKg: number;
  potentialSavingsKg: number;
}

export interface CarbonResult {
  totalCo2eKg: number;
  potentialTotalSavingsKg: number;
  items: CarbonResultItem[];
  ecoSwapRecommendations: EcoSwapRecommendation[];
}

export type ApiMode = "mock" | "live";

export interface ManualGroceryItem {
  id: string;
  type: "product";
  name: string;
  priceCad: number;
  quantity: number;
}

export interface ManualCalculationRequest {
  region: "CA";
  currency: "CAD";
  items: ManualGroceryItem[];
}
