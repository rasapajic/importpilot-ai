import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  createMadeInChinaSupplierSearchSource,
  parseMadeInChinaSearchHtml,
} from "../src/made-in-china-provider.js";

const fixturePath = fileURLToPath(new URL("./fixtures/made-in-china-search.html", import.meta.url));
const renderedFixturePath = fileURLToPath(new URL("./fixtures/made-in-china-rendered-search.html", import.meta.url));
const relatedFixturePath = fileURLToPath(new URL("./fixtures/made-in-china-related-search.html", import.meta.url));
const productNameFixturePath = fileURLToPath(new URL("./fixtures/made-in-china-product-name-search.html", import.meta.url));
const input = { productQuery: "PTZ camera", quantity: 100, targetCountry: "RS", language: "sr" as const };

describe("Made-in-China supplier search source", () => {
  it("normalizes successful fixture results", async () => {
    const results = parseMadeInChinaSearchHtml(await readFile(fixturePath, "utf8"));
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      title: "3MP Outdoor PTZ Camera",
      supplierName: "Shenzhen Camera Factory",
      supplierCountry: "CN",
      price: 24.5,
      currency: "USD",
      minimumOrderQuantity: 100,
      incoterm: "FOB",
      source: "Made-in-China",
    });
    expect(results[1]).toMatchObject({
      currency: "EUR",
      minimumOrderQuantity: null,
      incoterm: null,
      imageUrl: null,
    });
  });

  it("returns an empty normalized response when markup has no usable offers", async () => {
    const source = createMadeInChinaSupplierSearchSource({
      fetcher: async () => new Response("<html><body>No products</body></html>"),
    });
    await expect(source.search(input, new AbortController().signal)).resolves.toEqual({
      results: [],
      reason: "Made-in-China returned no parseable supplier offers.",
    });
  });

  it("retries a normalized query variant and returns its results", async () => {
    const fixture = await readFile(renderedFixturePath, "utf8");
    const requestedUrls: string[] = [];
    const source = createMadeInChinaSupplierSearchSource({
      fetcher: async (url) => {
        requestedUrls.push(String(url));
        return new Response(
          String(url).includes("type%20c%20phone%20charger")
            ? fixture
            : "<html><body><div class='no-result'>No matches were found</div></body></html>",
        );
      },
    });

    const outcome = await source.search({
      ...input,
      productQuery: "punjac za telefon typ c",
    }, new AbortController().signal);

    expect(Array.isArray(outcome) ? outcome : outcome.results).toHaveLength(1);
    expect(requestedUrls).toHaveLength(3);
    expect(requestedUrls[2]).toContain("type%20c%20phone%20charger");
  });

  it("continues to the next query variant after a request failure", async () => {
    const fixture = await readFile(renderedFixturePath, "utf8");
    let calls = 0;
    const source = createMadeInChinaSupplierSearchSource({
      fetcher: async () => {
        calls += 1;
        if (calls === 1) throw new Error("Temporary network failure");
        return new Response(fixture);
      },
    });

    const outcome = await source.search({
      ...input,
      productQuery: "punjac za telefon typ c",
    }, new AbortController().signal);

    expect(Array.isArray(outcome) ? outcome : outcome.results).toHaveLength(1);
    expect(calls).toBe(2);
  });

  it("falls back to the Made-in-China multi-search endpoint", async () => {
    const fixture = await readFile(renderedFixturePath, "utf8");
    const requestedUrls: string[] = [];
    const source = createMadeInChinaSupplierSearchSource({
      fetcher: async (url) => {
        requestedUrls.push(String(url));
        return new Response(
          String(url).includes("/multi-search/")
            ? fixture
            : "<html><body><div class='no-result'>No matches were found</div></body></html>",
        );
      },
    });

    const outcome = await source.search({
      ...input,
      productQuery: "punjac za telefon typ c",
    }, new AbortController().signal);

    expect(Array.isArray(outcome) ? outcome : outcome.results).toHaveLength(1);
    expect(requestedUrls).toHaveLength(4);
    expect(requestedUrls[3]).toContain("/multi-search/phone+charger+type+c/");
  });

  it("parses server-rendered Made-in-China product cards", async () => {
    const results = parseMadeInChinaSearchHtml(await readFile(renderedFixturePath, "utf8"));
    expect(results.length).toBeGreaterThan(0);
    expect(results).toEqual([
      expect.objectContaining({
        title: "Solar Panel Car Charger Set 100kw Monocrystalline Solar Panel",
        supplierName: "Jingjiang Alicosolar New Energy Co., Ltd.",
        price: 0.28,
        currency: "USD",
        minimumOrderQuantity: 3000,
        incoterm: "FOB",
        imageUrl: "https://image.made-in-china.com/solar-panel.webp",
        source: "Made-in-China",
      }),
    ]);
  });

  it("parses related-result cards using the real supplier storefront hostname", async () => {
    const results = parseMadeInChinaSearchHtml(await readFile(relatedFixturePath, "utf8"));
    expect(results).toEqual([
      expect.objectContaining({
        title: "3MP Surveillance Outdoor Security Camera",
        supplierName: "szautoe.en.made-in-china.com",
        price: 14.99,
        currency: "USD",
        minimumOrderQuantity: 10,
        incoterm: "FOB",
        imageUrl: "https://image.made-in-china.com/ptz-camera.jpg",
        source: "Made-in-China",
      }),
    ]);
  });

  it("parses the current Made-in-China product-name result cards", async () => {
    const results = parseMadeInChinaSearchHtml(await readFile(productNameFixturePath, "utf8"));
    expect(results).toEqual([
      expect.objectContaining({
        title: "Pd 20W Single USB-C Type-C Travel Charger",
        supplierName: "Shenzhen Langbo Technology Co., Ltd.",
        price: 1.72,
        currency: "USD",
        minimumOrderQuantity: 100,
        incoterm: "FOB",
        imageUrl: "https://image.made-in-china.com/type-c-charger.jpg",
        source: "Made-in-China",
      }),
    ]);
  });

  it("returns a clear reason for JavaScript-only pages", async () => {
    const events: Array<{ event: string; details?: Record<string, unknown> }> = [];
    const source = createMadeInChinaSupplierSearchSource({
      fetcher: async () => new Response("<html><body><div id='app'></div><script src='app.js'></script></body></html>"),
      logger: (event, details) => events.push({ event, details }),
    });

    await expect(source.search(input, new AbortController().signal)).resolves.toEqual({
      results: [],
      reason: "Made-in-China returned a JavaScript-only page without server-rendered results.",
    });
    expect(events).toContainEqual({
      event: "provider_empty_reason",
      details: {
        provider_name: "made-in-china-v1",
        reason: "Made-in-China returned a JavaScript-only page without server-rendered results.",
      },
    });
  });

  it("saves at most 300 KB of HTML only when development debugging is enabled", async () => {
    const writes: Array<{ path: string; size: number }> = [];
    const events: Array<{ event: string; details?: Record<string, unknown> }> = [];
    const largeHtml = `<html>${"x".repeat(400_000)}</html>`;
    const source = createMadeInChinaSupplierSearchSource({
      debugHtml: true,
      environment: "development",
      debugDirectory: tmpdir(),
      fetcher: async () => new Response(largeHtml),
      logger: (event, details) => events.push({ event, details }),
    });

    await source.search(input, new AbortController().signal);
    const saved = events.find((entry) => entry.event === "debug_html_saved");
    expect(saved?.details).toMatchObject({ html_saved: true, provider_name: "made-in-china-v1" });
    const path = String(saved?.details?.file_path);
    const savedHtml = await readFile(path);
    writes.push({ path, size: savedHtml.byteLength });
    expect(writes[0]?.size).toBe(300_000);
    await unlink(path);
  });

  it("does not save debug HTML outside development", async () => {
    const events: string[] = [];
    const source = createMadeInChinaSupplierSearchSource({
      debugHtml: true,
      environment: "production",
      fetcher: async () => new Response("<html></html>"),
      logger: (event) => events.push(event),
    });

    await source.search(input, new AbortController().signal);
    expect(events).not.toContain("debug_html_saved");
  });
});
