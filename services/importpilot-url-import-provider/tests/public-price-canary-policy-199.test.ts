import { describe, expect, it, vi } from "vitest";
import { createPublicPriceCanaryGate } from "../src/public-price-canary-policy.js";

const pilot = "https://pilotoptics.en.made-in-china.com/product/WJfUCnDTuekA/China-Pilot-Optics-Wholesale-High-Quality-5-Colors-Custom-Logo-Square-Reading-Glasses.html";
const other = pilot.replace("WJfUCnDTuekA", "OTHERSKU123");
const catalog = "https://pilotoptics.en.made-in-china.com/product-group/UejAsgVMrLhv/Reading-glasses-catalog-1.html";
const publicRange = {
  kind: "SINGLE_SELLER_CATALOG_ADVERTISED_RANGE" as const,
  productUrl: pilot,
  sourceUrl: catalog,
  lowPrice: "0.5",
  highPrice: "2",
  currency: "USD",
  unit: "Piece" as const,
  minimumOrderQuantity: 1200,
  corroborated: false as const,
  verifiedQuote: false as const,
};

describe("shared provider exact-product price source canary and fetch quota", () => {
  it("does not issue any extra GET when feature is disabled or canary URL is not configured", async () => {
    const loader = vi.fn(async () => publicRange);
    for (const gate of [
      createPublicPriceCanaryGate({ enabled: false, canaryProductUrl: pilot }),
      createPublicPriceCanaryGate({ enabled: true }),
      createPublicPriceCanaryGate({ enabled: true, canaryProductUrl: "" }),
      createPublicPriceCanaryGate({ enabled: true, canaryProductUrl: other + "#wrong" }),
    ]) {
      expect(gate.eligible(pilot)).toBe(false);
      await expect(gate.getOrRead(pilot, loader)).resolves.toBeNull();
    }
    expect(loader).not.toHaveBeenCalled();
  });

  it("permits only the exact configured Pilot Optics SKU, not another model or seller", async () => {
    const gate = createPublicPriceCanaryGate({ enabled: true, canaryProductUrl: pilot });
    const loader = vi.fn(async () => publicRange);
    expect(gate.eligible(pilot)).toBe(true);
    for (const target of [other, pilot.replace("pilotoptics.en", "attacker.en"), pilot + "?variant=other"]) {
      expect(gate.eligible(target)).toBe(false);
      await expect(gate.getOrRead(target, loader)).resolves.toBeNull();
    }
    expect(loader).not.toHaveBeenCalled();
    expect(await gate.getOrRead(pilot, loader)).toEqual(publicRange);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("coalesces concurrent authenticated previews and limits reads to one pair per ten minutes", async () => {
    let clock = 1_000_000;
    const gate = createPublicPriceCanaryGate({
      enabled: true,
      canaryProductUrl: pilot,
      now: () => clock,
      intervalMs: 1, // cannot weaken the hard 10-minute minimum
    });
    let release: ((value: typeof publicRange) => void) | null = null;
    const loader = vi.fn(() => new Promise<typeof publicRange>((resolve) => { release = resolve; }));
    const a = gate.getOrRead(pilot, loader);
    const b = gate.getOrRead(pilot, loader);
    await Promise.resolve();
    expect(loader).toHaveBeenCalledTimes(1);
    if (!release) throw new Error("test loader did not start");
    (release as (value: typeof publicRange) => void)(publicRange);
    expect(await a).toEqual(publicRange);
    expect(await b).toEqual(publicRange);
    clock += 599_999;
    expect(await gate.getOrRead(pilot, loader)).toEqual(publicRange);
    expect(loader).toHaveBeenCalledTimes(1);
    clock += 1;
    const third = gate.getOrRead(pilot, loader);
    await Promise.resolve();
    expect(loader).toHaveBeenCalledTimes(2);
    (release as (value: typeof publicRange) => void)(publicRange);
    expect(await third).toEqual(publicRange);
  });

  it("failed source requests and video 403 still consume the full quota", async () => {
    let clock = 0;
    const gate = createPublicPriceCanaryGate({
      enabled: true, canaryProductUrl: pilot, now: () => clock,
    });
    const loader = vi.fn()
      .mockRejectedValueOnce(new Error("blocked video, fallback unavailable"))
      .mockResolvedValueOnce(publicRange);
    expect(await gate.getOrRead(pilot, loader)).toBeNull();
    clock += 200_000;
    expect(await gate.getOrRead(pilot, loader)).toBeNull();
    expect(loader).toHaveBeenCalledTimes(1);
    clock += 400_000;
    expect(await gate.getOrRead(pilot, loader)).toEqual(publicRange);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("never accepts a different SKU from the underlying source parser into the cache", async () => {
    const gate = createPublicPriceCanaryGate({ enabled: true, canaryProductUrl: pilot });
    const loader = vi.fn(async () => ({ ...publicRange, productUrl: other }));
    expect(await gate.getOrRead(pilot, loader)).toBeNull();
    expect(await gate.getOrRead(pilot, loader)).toBeNull();
    expect(loader).toHaveBeenCalledTimes(1);
  });
});
