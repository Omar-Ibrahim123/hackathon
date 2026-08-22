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
      items: [
        { id: "beef", name: "Ground beef", co2eKg: 3.1 },
        { id: "cheese", name: "Cheddar cheese", co2eKg: 1.2 },
        { id: "oat-milk", name: "Oat milk", co2eKg: 0.5 },
        { id: "bread", name: "Bread", co2eKg: 0.4 },
        { id: "produce", name: "Produce", co2eKg: 1.2 },
      ],
    });
  });

  it("surfaces a live receipt failure without returning mock data", async () => {
    vi.stubEnv("VITE_API_MODE", "live");
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.test");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Receipt service unavailable." }), {
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
      "https://api.example.test/api/receipts/analyze",
    );
  });

  it("posts the Canada-wide manual payload in live mode", async () => {
    vi.stubEnv("VITE_API_MODE", "live");
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.test");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          totalCo2eKg: 2.7,
          items: [{ id: "apples", name: "Apples", co2eKg: 0.9 }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { calculateManual } = await import("./api");

    await expect(
      calculateManual([
        { id: "apples", type: "produce", name: "Apples", priceCad: 4.5 },
      ]),
    ).resolves.toEqual({
      totalCo2eKg: 2.7,
      items: [{ id: "apples", name: "Apples", co2eKg: 0.9 }],
    });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.example.test/api/groceries/calculate",
    );
    expect(JSON.parse(request.body as string)).toEqual({
      region: "CA",
      currency: "CAD",
      items: [
        { id: "apples", type: "produce", name: "Apples", priceCad: 4.5 },
      ],
    });
  });
});
