import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("frontend carbon API", () => {
  it("defaults to the deterministic delayed receipt fixture", async () => {
    vi.useFakeTimers();
    vi.stubEnv("VITE_API_MODE", "");
    const { analyzeReceipt } = await import("./api");

    const resultPromise = analyzeReceipt(
      new File(["receipt"], "receipt.jpg", { type: "image/jpeg" }),
    );

    await vi.advanceTimersByTimeAsync(649);
    let settled = false;
    void resultPromise.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await expect(resultPromise).resolves.toEqual({
      totalCo2eKg: 6.4,
      potentialTotalSavingsKg: 2.69,
      ecoSwapRecommendations: [
        {
          originalItem: "Ground beef",
          originalCo2eKg: 3.1,
          recommendedSwap: "Lentils",
          swapCo2eKg: 0.41,
          potentialSavingsKg: 2.69,
        },
      ],
      items: [
        { id: "beef", name: "Ground beef", co2eKg: 3.1 },
        { id: "cheese", name: "Cheddar cheese", co2eKg: 1.2 },
        { id: "oat-milk", name: "Oat milk", co2eKg: 0.5 },
        { id: "bread", name: "Bread", co2eKg: 0.4 },
        { id: "produce", name: "Produce", co2eKg: 1.2 },
      ],
    });
  });

  it("posts a receipt to the FastAPI scan endpoint and normalizes its response", async () => {
    vi.stubEnv("VITE_API_MODE", "live");
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.test");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          summary: {
            total_co2e_kg: 2.4,
            total_items_processed: 1,
            potential_total_savings_kg: 9.59,
          },
          line_items: [
            {
              raw_item: "OATLY BARISTA OAT MILK",
              matched_item: "Oat milk",
              item_co2e_kg: 2.4,
            },
          ],
          eco_swap_recommendations: [
            {
              original_item: "Ground beef",
              original_co2e_kg: 10,
              recommended_swap: "Lentils",
              swap_co2e_kg: 0.41,
              potential_savings_kg: 9.59,
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { analyzeReceipt } = await import("./api");
    const file = new File(["receipt"], "receipt.jpg", {
      type: "image/jpeg",
    });

    await expect(analyzeReceipt(file)).resolves.toEqual({
      totalCo2eKg: 2.4,
      potentialTotalSavingsKg: 9.59,
      ecoSwapRecommendations: [
        {
          originalItem: "Ground beef",
          originalCo2eKg: 10,
          recommendedSwap: "Lentils",
          swapCo2eKg: 0.41,
          potentialSavingsKg: 9.59,
        },
      ],
      items: [{ id: "item-0", name: "Oat milk", co2eKg: 2.4 }],
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.example.test/api/receipts/scan",
    );
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(request.method).toBe("POST");
    expect(request.body).toBeInstanceOf(FormData);
    expect((request.body as FormData).get("file")).toBe(file);
    expect((request.body as FormData).get("receipt")).toBeNull();
  });

  it("surfaces a live receipt failure without returning mock data", async () => {
    vi.stubEnv("VITE_API_MODE", "live");
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.test");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "Receipt service unavailable." }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { analyzeReceipt } = await import("./api");

    await expect(
      analyzeReceipt(
        new File(["receipt"], "receipt.jpg", { type: "image/jpeg" }),
      ),
    ).rejects.toThrow("Receipt service unavailable.");

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.example.test/api/receipts/scan",
    );
  });

  it("translates manual groceries for the FastAPI analyze endpoint", async () => {
    vi.stubEnv("VITE_API_MODE", "live");
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.test");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          summary: {
            total_co2e_kg: 0.9,
            total_items_processed: 1,
            potential_total_savings_kg: 0,
          },
          line_items: [
            {
              raw_item: "Apples",
              matched_item: "Apple",
              item_co2e_kg: 0.9,
            },
          ],
          eco_swap_recommendations: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { calculateManual } = await import("./api");

    await expect(
      calculateManual([
        {
          id: "apples",
          type: "product",
          name: "Apples",
          priceCad: 4.5,
          quantity: 2,
        },
      ]),
    ).resolves.toEqual({
      totalCo2eKg: 0.9,
      potentialTotalSavingsKg: 0,
      ecoSwapRecommendations: [],
      items: [{ id: "item-0", name: "Apple", co2eKg: 0.9 }],
    });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.example.test/api/receipts/analyze",
    );
    expect(request.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(request.body as string)).toEqual({
      items: [{ raw_item: "Apples", qty: 2 }],
    });
  });

  it.each([
    { summary: {}, line_items: [] },
    { summary: { total_co2e_kg: -1 }, line_items: [] },
    {
      summary: { total_co2e_kg: 1 },
      line_items: [{ raw_item: "Apples", item_co2e_kg: Number.NaN }],
    },
    {
      summary: {
        total_co2e_kg: 1,
        potential_total_savings_kg: 1,
      },
      line_items: [{ raw_item: "Apples", item_co2e_kg: 1 }],
      eco_swap_recommendations: [
        {
          original_item: "Apples",
          original_co2e_kg: 1,
          recommended_swap: "Pears",
          swap_co2e_kg: 0.5,
          potential_savings_kg: -1,
        },
      ],
    },
  ])("rejects malformed backend results", async (payload) => {
    vi.stubEnv("VITE_API_MODE", "live");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { calculateManual } = await import("./api");

    await expect(
      calculateManual([
        {
          id: "apples",
          type: "product",
          name: "Apples",
          priceCad: 4.5,
          quantity: 1,
        },
      ]),
    ).rejects.toThrow("The calculation service returned an invalid response.");
  });

  it("converts a rejected fetch into the shared request failure", async () => {
    vi.stubEnv("VITE_API_MODE", "live");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("fetch failed")),
    );
    const { calculateManual } = await import("./api");

    await expect(
      calculateManual([
        {
          id: "apples",
          type: "product",
          name: "Apples",
          priceCad: 4.5,
          quantity: 1,
        },
      ]),
    ).rejects.toThrow("Unable to calculate your groceries right now.");
  });
});
