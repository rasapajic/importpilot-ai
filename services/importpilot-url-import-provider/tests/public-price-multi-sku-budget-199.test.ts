import { describe, expect, it, vi } from "vitest";
import {
  createPublicPriceCanaryGate,
  type PublicPriceGateEvent,
} from "../src/public-price-canary-policy.js";

const pilot = "https://pilotoptics.en.made-in-china.com/product/WJfUCnDTuekA/China-Pilot-Optics-Wholesale-High-Quality-5-Colors-Custom-Logo-Square-Reading-Glasses.html";
// Synthetic additional product URLs only: never contacted by any test.
const two = "https://demooptics.en.made-in-china.com/product/ABCDEFGH1234/China-Polarized-Outdoor-Sunglasses.html";
const three = "https://demotools.en.made-in-china.com/product/WXYZabcd4567/China-Portable-Magnetic-Drill.html";
const four = "https://demotools.en.made-in-china.com/product/EFGHijkl9988/China-Magnetic-Drill-Accessories.html";

function publicResult(productUrl: string) {
  return {
    kind: "SINGLE_SELLER_CATALOG_ADVERTISED_RANGE" as const,
    productUrl,
    sourceUrl: "https://demooptics.en.made-in-china.com/product-group/ABCDEFGH/Glasses-catalog-1.html",
    lowPrice: "0.5", highPrice: "2", currency: "USD",
    unit: "Piece" as const, minimumOrderQuantity: 1200,
    corroborated: false as const, verifiedQuote: false as const,
  };
}

describe("JAKOV360 #199 multiple exact SKU source-read budget", () => {
  it("keeps the live Pilot-only behavior when additional allowlist is unset", async () => {
    const gate = createPublicPriceCanaryGate({ enabled: true, canaryProductUrl: pilot });
    expect(gate.status()).toMatchObject({
      enabled: true, configurationValid: true, allowedProducts: 1,
      maxProducts: 3, maxPairsPerTenMinutesPerInstance: 2,
    });
    expect(gate.eligible(pilot)).toBe(true);
    expect(gate.eligible(two)).toBe(false);
    const loader = vi.fn(async () => publicResult(two));
    expect(await gate.getOrRead(two, loader)).toBeNull();
    expect(loader).not.toHaveBeenCalled();
  });

  it("enables at most two explicit additional exact HTTPS Made-in-China SKUs", async () => {
    const gate = createPublicPriceCanaryGate({
      enabled: true, canaryProductUrl: pilot,
      additionalProductUrlsJson: JSON.stringify([two, three]),
    });
    expect(gate.status()).toMatchObject({ allowedProducts: 3, configurationValid: true });
    expect([pilot, two, three].every(url => gate.eligible(url))).toBe(true);
    expect(gate.eligible(four)).toBe(false);
    expect(gate.eligible(two + "?variant=red")).toBe(false);
    expect(gate.eligible(two.replace("demooptics.en.", "attacker.example."))).toBe(false);
  });

  it("rejects the WHOLE configuration on invalid/duplicate/untrusted/oversized entries", async () => {
    const invalid = [
      "[", "null", '{"url":"' + two + '"}',
      JSON.stringify([two, three, four]),
      JSON.stringify([two, two]),
      JSON.stringify([pilot]),
      JSON.stringify([two + "?redirect=1"]),
      JSON.stringify([two + "#otherSku"]),
      JSON.stringify(["http:" + two.slice(6)]),
      JSON.stringify(["https://example.org/product/ABCDEFGH1234/China-Glasses.html"]),
      JSON.stringify(["https://user:password@demooptics.en.made-in-china.com/product/ABCDEFGH1234/China-Polarized-Outdoor-Sunglasses.html"]),
      JSON.stringify([123]),
      " ".repeat(2002) + JSON.stringify([two]),
    ];
    for (const input of invalid) {
      const gate = createPublicPriceCanaryGate({
        enabled: true, canaryProductUrl: pilot,
        additionalProductUrlsJson: input,
      });
      expect(gate.status().enabled, input.slice(0, 60)).toBe(false);
      expect(gate.status().allowedProducts).toBe(0);
      expect(gate.eligible(pilot)).toBe(false);
      const loader = vi.fn(async () => publicResult(pilot));
      expect(await gate.getOrRead(pilot, loader)).toBeNull();
      expect(loader).not.toHaveBeenCalled();
    }
  });

  it("enforces a single aggregate TWO-pair budget across all THREE allowed SKUs", async () => {
    let clock = 1_000_000;
    const gate = createPublicPriceCanaryGate({
      enabled: true, canaryProductUrl: pilot,
      additionalProductUrlsJson: JSON.stringify([two, three]), now: () => clock,
    });
    const loader = vi.fn(async (url: string) => publicResult(url));
    expect(await gate.getOrRead(pilot, () => loader(pilot))).toEqual(publicResult(pilot));
    expect(await gate.getOrRead(two, () => loader(two))).toEqual(publicResult(two));
    expect(gate.status()).toMatchObject({ attemptsInCurrentWindow: 2, inFlight: false });
    expect(await gate.getOrRead(three, () => loader(three))).toBeNull();
    expect(loader).toHaveBeenCalledTimes(2);
    clock += 599_999;
    expect(await gate.getOrRead(three, () => loader(three))).toBeNull();
    expect(gate.status().attemptsInCurrentWindow).toBe(2);
    clock += 1;
    expect(await gate.getOrRead(three, () => loader(three))).toEqual(publicResult(three));
    expect(loader).toHaveBeenCalledTimes(3);
    expect(gate.status().attemptsInCurrentWindow).toBe(1);
  });

  it("returns cached price without spending global quota and enforces per-SKU cooldown", async () => {
    let clock = 0;
    const gate = createPublicPriceCanaryGate({
      enabled: true, canaryProductUrl: pilot,
      additionalProductUrlsJson: JSON.stringify([two]),
      now: () => clock,
    });
    const loader = vi.fn(async () => publicResult(pilot));
    expect(await gate.getOrRead(pilot, loader)).toEqual(publicResult(pilot));
    clock += 100_000;
    expect(await gate.getOrRead(pilot, loader)).toEqual(publicResult(pilot));
    expect(loader).toHaveBeenCalledTimes(1);
    expect(gate.status().attemptsInCurrentWindow).toBe(1);
  });

  it("shares in-flight requests for the same SKU and refuses cross-SKU concurrency", async () => {
    const gate = createPublicPriceCanaryGate({
      enabled: true, canaryProductUrl: pilot,
      additionalProductUrlsJson: JSON.stringify([two]),
    });
    let release: ((value: ReturnType<typeof publicResult>) => void) | null = null;
    const mainLoader = vi.fn(() => new Promise<ReturnType<typeof publicResult>>(resolve => {
      release = resolve;
    }));
    const secondaryLoader = vi.fn(async () => publicResult(two));
    const one = gate.getOrRead(pilot, mainLoader);
    const second = gate.getOrRead(pilot, mainLoader);
    await Promise.resolve();
    expect(mainLoader).toHaveBeenCalledTimes(1);
    expect(gate.status().inFlight).toBe(true);
    expect(await gate.getOrRead(two, secondaryLoader)).toBeNull();
    expect(secondaryLoader).not.toHaveBeenCalled();
    if (!release) throw new Error("Main loader did not start");
    (release as (value: ReturnType<typeof publicResult>) => void)(publicResult(pilot));
    await expect(one).resolves.toEqual(publicResult(pilot));
    await expect(second).resolves.toEqual(publicResult(pilot));
    expect(gate.status()).toMatchObject({ attemptsInCurrentWindow: 1, inFlight: false });
    await expect(gate.getOrRead(two, secondaryLoader)).resolves.toEqual(publicResult(two));
    expect(gate.status().attemptsInCurrentWindow).toBe(2);
  });

  it("spends source budget on network errors, HTTP 403 and null results; never retries automatically", async () => {
    let clock = 50_000;
    const outcomes: PublicPriceGateEvent[] = [];
    const gate = createPublicPriceCanaryGate({
      enabled: true, canaryProductUrl: pilot,
      additionalProductUrlsJson: JSON.stringify([two, three]),
      now: () => clock,
      onEvent: e => outcomes.push(e),
    });
    const blocked = vi.fn(async () => {
      throw new Error("blocked");
    });
    const empty = vi.fn(async () => null);
    expect(await gate.getOrRead(pilot, blocked)).toBeNull();
    expect(await gate.getOrRead(two, empty)).toBeNull();
    const other = vi.fn(async () => publicResult(three));
    expect(await gate.getOrRead(three, other)).toBeNull();
    expect(blocked).toHaveBeenCalledTimes(1);
    expect(empty).toHaveBeenCalledTimes(1);
    expect(other).not.toHaveBeenCalled();
    expect(outcomes.map(x => x.outcome)).toEqual([
      "attempt_started", "request_failed", "attempt_started",
      "no_evidence", "global_budget_exhausted",
    ]);
    clock += 600_000;
    expect(await gate.getOrRead(three, other)).toEqual(publicResult(three));
  });

  it("emits only bounded non-sensitive outcome labels and ignores logging exceptions", async () => {
    const events: PublicPriceGateEvent[] = [];
    const gate = createPublicPriceCanaryGate({
      enabled: true, canaryProductUrl: pilot,
      onEvent: e => {
        events.push(e);
        throw new Error("logging pipeline unavailable");
      },
    });
    expect(await gate.getOrRead(pilot, async () => publicResult(pilot))).toEqual(publicResult(pilot));
    expect(events.map(e => e.outcome)).toEqual(["attempt_started", "catalog_only"]);
    const logs = JSON.stringify(events);
    expect(logs).not.toContain("pilotoptics");
    expect(logs).not.toContain("WJfUCnDTuekA");
    expect(logs).not.toContain("0.5");
    expect(logs).not.toContain("http");
    expect(logs).toContain('"pairBudgetPerTenMinutes":2');
  });

  it("rejects a loader returning another SKU or a pretend confirmed supplier quote", async () => {
    const wrongSku = createPublicPriceCanaryGate({ enabled: true, canaryProductUrl: pilot });
    expect(await wrongSku.getOrRead(pilot, async () => publicResult(two))).toBeNull();
    const falseQuote = createPublicPriceCanaryGate({ enabled: true, canaryProductUrl: pilot });
    const fakeResult = { ...publicResult(pilot), verifiedQuote: true };
    const typed = fakeResult as unknown as ReturnType<typeof publicResult>;
    expect(await falseQuote.getOrRead(pilot, async () => typed)).toBeNull();
  });
});
