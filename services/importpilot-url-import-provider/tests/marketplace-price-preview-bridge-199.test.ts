import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { previewProductUrl } from "../src/fetcher.js";
import { createPublicPriceCanaryGate } from "../src/public-price-canary-policy.js";

const productUrl =
  "https://pilotoptics.en.made-in-china.com/product/WJfUCnDTuekA/China-Pilot-Optics-Wholesale-High-Quality-5-Colors-Custom-Logo-Square-Reading-Glasses.html";
const catalogUrl =
  "https://pilotoptics.en.made-in-china.com/product-group/UejAsgVMrLhv/Reading-glasses-catalog-1.html";
const videoUrl =
  "https://www.made-in-china.com/video-channel/pilotoptics_WJfUCnDTuekA_Pilot-Optics-Wholesale-High-Quality-5-Colors-Custom-Logo-Square-Reading-Glasses.html";
const title = "Pilot Optics Wholesale High Quality 5 Colors Custom Logo Square Reading Glasses";
const productHtml = '<html><head><meta property="og:title" content="' + title + '">' +
  '<script>{"price":"0.50","currency":"USD"}</script></head><body><h1>' +
  title + '</h1><p>Q3: what\'s your MOQ?</p><p>A3:1200 pcs per item</p>' +
  '<a href="' + catalogUrl + '">Reading glasses</a></body></html>';
const catalogHtml = '<html><body><div class="product-card"><a href="' + productUrl + '">' +
  title + '</a><div>FOB Price: US $0.5-2 / Piece</div>' +
  '<p>Min. Order: 1,200 Pieces</p></div></body></html>';
const videoHtml = '<html><body><h1>What is ' + title + '</h1>' +
  '<div>Min. Order Reference FOB Price</div><div>1,200 Pieces US$0.50-2.00 / Piece</div></body></html>';

function response(html: string, status = 200) {
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

function fetcherFor(videoStatus = 403, catalog = catalogHtml) {
  return vi.fn(async (target: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(target);
    if (url === productUrl) return response(productHtml);
    if (url === catalogUrl) return response(catalog);
    if (url === videoUrl) return response(videoStatus === 200 ? videoHtml : "Blocked", videoStatus);
    throw new Error("Unexpected URL fetch");
  });
}

describe("provider #199 public evidence preview bridge", () => {
  it("has zero extra requests by default and preserves initial price/MOQ", async () => {
    const fetcher = fetcherFor();
    const preview = await previewProductUrl(productUrl, { fetcher: fetcher as typeof fetch });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(preview.price).toBe("0.50");
    expect(preview.minimumOrderQuantity).toBe("1200");
    expect(preview.marketplacePriceEvidence).toBeUndefined();
  });

  it("with opt-in, returns a non-corroborated seller catalog range after video 403", async () => {
    const fetcher = fetcherFor(403);
    const preview = await previewProductUrl(productUrl, {
      fetcher: fetcher as typeof fetch,
      publicPriceEvidenceEnabled: true,
      publicPriceCanaryGate: createPublicPriceCanaryGate({ enabled: true, canaryProductUrl: productUrl }),
    });
    expect(fetcher).toHaveBeenCalledTimes(3); // main + catalog + video; bounded
    expect(fetcher.mock.calls.map(call => String(call[0]))).toEqual([
      productUrl, catalogUrl, videoUrl,
    ]);
    expect(preview.price).toBe("0.50");
    expect(preview.currency).toBe("USD");
    expect(preview.minimumOrderQuantity).toBe("1200");
    expect(preview.marketplacePriceEvidence).toEqual({
      kind: "SINGLE_SELLER_CATALOG_ADVERTISED_RANGE",
      sourceUrl: catalogUrl, productUrl,
      lowPrice: "0.5", highPrice: "2", currency: "USD",
      unit: "Piece", minimumOrderQuantity: 1200,
      corroborated: false, verifiedQuote: false,
    });
  });

  it("returns two same-platform listing references only when video is truly readable", async () => {
    const fetcher = fetcherFor(200);
    const preview = await previewProductUrl(productUrl, {
      fetcher: fetcher as typeof fetch,
      publicPriceEvidenceEnabled: true,
      publicPriceCanaryGate: createPublicPriceCanaryGate({ enabled: true, canaryProductUrl: productUrl }),
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(preview.marketplacePriceEvidence).toMatchObject({
      kind: "CORROBORATED_ADVERTISED_RANGE",
      productUrl,
      evidence: [videoUrl, catalogUrl],
      lowPrice: "0.50", highPrice: "2.00",
      verifiedQuote: false,
    });
    expect(preview.price).toBe("0.50");
  });

  it("quarantines a catalog/FAQ MOQ mismatch without creating a priced offer", async () => {
    const fetcher = fetcherFor(200, catalogHtml.replace("Min. Order: 1,200 Pieces", "Min. Order: 200 Pieces"));
    const preview = await previewProductUrl(productUrl, {
      fetcher: fetcher as typeof fetch,
      publicPriceEvidenceEnabled: true,
      publicPriceCanaryGate: createPublicPriceCanaryGate({ enabled: true, canaryProductUrl: productUrl }),
    });
    expect(preview.minimumOrderQuantity).toBeNull();
    expect(preview.price).toBeNull();
    expect(preview.marketplacePriceEvidence ?? null).toBeNull();
    expect(preview.moqConflictEvidence).toMatchObject({
      kind: "SELLER_CATALOG_FAQ_MOQ_CONFLICT",
      productUrl,
      faqMinimumOrderQuantity: 1200,
      catalogMinimumOrderQuantity: 200,
      corroborated: false,
      verifiedQuote: false,
      landedCostEligible: false,
    });
    expect(fetcher.mock.calls.map(call => String(call[0]))).toEqual([productUrl, catalogUrl]);
  });

  it("requires the exact server-only opt-in before any source fetching", () => {
    const config = readFileSync(join(import.meta.dirname, "..", "src", "dev.ts"), "utf8");
    expect(config).toContain('process.env.URL_IMPORT_PUBLIC_PRICE_EVIDENCE === "enabled"');
    const route = readFileSync(join(import.meta.dirname, "..", "src", "app.ts"), "utf8");
    expect(route).toContain("publicPriceEvidenceEnabled: options.publicPriceEvidenceEnabled");
  });
});
