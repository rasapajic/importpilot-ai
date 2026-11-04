import { describe, expect, it, vi } from "vitest";

import {
  discoverExactSellerCatalogUrl,
  exactMadeInChinaProductIdentity,
  expectedVideoSourceUrl,
  parseExactCatalogPriceSource,
  parseExactVideoPriceSource,
} from "../src/marketplace-price-source-parser.js";
import { readCorroboratedMarketplacePrice } from "../src/marketplace-price-source-reader.js";

const productUrl = "https://pilotoptics.en.made-in-china.com/product/WJfUCnDTuekA/China-Pilot-Optics-Wholesale-High-Quality-5-Colors-Custom-Logo-Square-Reading-Glasses.html";
const catalogUrl = "https://pilotoptics.en.made-in-china.com/product-group/UejAsgVMrLhv/Reading-glasses-catalog-1.html";
const videoUrl = "https://www.made-in-china.com/video-channel/pilotoptics_WJfUCnDTuekA_Pilot-Optics-Wholesale-High-Quality-5-Colors-Custom-Logo-Square-Reading-Glasses.html";
const title = "Pilot Optics Wholesale High Quality 5 Colors Custom Logo Square Reading Glasses";
const productHtml = '<html><body><h1>' + title + '</h1>' +
  '<section>Product Groups <a href="/product-group/UejAsgVMrLhv/Reading-glasses-catalog-1.html">Reading glasses</a></section>' +
  '</body></html>';
const videoHtml = '<html><head><title>Videos</title></head><body>' +
  '<h1>What is ' + title + '</h1>' +
  '<div><strong>Min. Order Reference FOB Price</strong></div>' +
  '<div>1,200 Pieces <span>US$0.50-2.00 / Piece</span></div>' +
  '<section>Other video products: US$9.99 / Piece</section>' +
  '</body></html>';
const catalogHtml = '<html><body><div class="product-card">' +
  '<a href="' + productUrl + '">' + title + '</a>' +
  '<div>FOB Price: US $0.5-2 / Piece</div>' +
  '<p>Min. Order: 1,200 Pieces</p>' +
  '</div><div class="product-card">' +
  '<a href="/product/OtherSKU12/China-Kids-Reading-Glasses.html">Kids Reading Glasses</a>' +
  '<div>FOB Price: US $0.2-3 / Piece</div><p>Min. Order: 300 Pieces</p>' +
  '</div></body></html>';

function fakeResponse(content: string, options: {
  status?: number;
  contentType?: string;
  claimedBytes?: number;
  url?: string;
} = {}): Response {
  const response = new Response(content, {
    status: options.status ?? 200,
    headers: {
      "content-type": options.contentType ?? "text/html; charset=utf-8",
      ...(options.claimedBytes ? { "content-length": String(options.claimedBytes) } : {}),
    },
  });
  if (options.url) Object.defineProperty(response, "url", { value: options.url });
  return response;
}

function fakeFetcher(videoContent = videoHtml, catalogContent = catalogHtml) {
  return vi.fn(async (request: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(request);
    if (url === videoUrl) return fakeResponse(videoContent);
    if (url === catalogUrl) return fakeResponse(catalogContent);
    throw new Error("Untrusted fetch target " + url);
  });
}

describe("read-only two-source extraction and fetch #199", () => {
  it("generates the exact SKU/seller video URL and only one discovered catalog URL", () => {
    expect(expectedVideoSourceUrl(productUrl)).toBe(videoUrl);
    expect(discoverExactSellerCatalogUrl(productHtml, productUrl)).toBe(catalogUrl);
    expect(exactMadeInChinaProductIdentity(productUrl)).toMatchObject({
      seller: "pilotoptics", sku: "WJfUCnDTuekA",
    });
  });

  it("extracts reference FOB price only from the exact video header and main price block", () => {
    expect(parseExactVideoPriceSource(videoHtml, productUrl, videoUrl)).toMatchObject({
      kind: "VIDEO_CHANNEL", lowPrice: "0.50", highPrice: "2.00",
      currency: "USD", unit: "Piece", minimumOrderQuantity: 1200,
    });
  });

  it("binds the catalog price and MOQ to the exact item anchor, not the next card", () => {
    expect(parseExactCatalogPriceSource(catalogHtml, productUrl, catalogUrl)).toMatchObject({
      kind: "SUPPLIER_CATALOG", lowPrice: "0.5", highPrice: "2",
      minimumOrderQuantity: 1200,
    });
  });

  it("reads at most video and catalog, then returns public range with verifiedQuote false", async () => {
    const fetcher = fakeFetcher();
    const result = await readCorroboratedMarketplacePrice(productUrl, productHtml, {
      enabled: true, fetcher: fetcher as typeof fetch,
    });
    expect(result).toMatchObject({
      kind: "CORROBORATED_ADVERTISED_RANGE",
      productUrl, lowPrice: "0.50", highPrice: "2.00",
      minimumOrderQuantity: 1200, verifiedQuote: false,
      evidence: [videoUrl, catalogUrl],
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.map(call => String(call[0]))).toEqual([videoUrl, catalogUrl]);
    for (const call of fetcher.mock.calls) {
      expect(call[1]?.redirect).toBe("manual");
      expect(call[1]?.method).toBe("GET");
    }
  });

  it("never makes a network request by default or without catalog discovery", async () => {
    const fetcher = fakeFetcher();
    expect(await readCorroboratedMarketplacePrice(productUrl, productHtml, {
      fetcher: fetcher as typeof fetch,
    })).toBeNull();
    expect(await readCorroboratedMarketplacePrice(productUrl, "<h1>No catalog links</h1>", {
      enabled: true, fetcher: fetcher as typeof fetch,
    })).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects multiple same-category catalog URLs and cross-seller URL injection", async () => {
    const extra = '<a href="https://pilotoptics.en.made-in-china.com/product-group/ABCDEFGH/Reading-glasses-catalog-2.html">Reading glasses</a>';
    const crossSeller = '<a href="https://attacker.en.made-in-china.com/product-group/UejAsgVMrLhv/Reading-glasses-catalog-1.html">Reading glasses</a>';
    expect(discoverExactSellerCatalogUrl(productHtml + extra, productUrl)).toBeNull();
    expect(discoverExactSellerCatalogUrl(crossSeller, productUrl)).toBeNull();
    expect(discoverExactSellerCatalogUrl(productHtml.replace("https:", "http:"), productUrl)).toBe(catalogUrl);
  });

  it("rejects video redirect, wrong URL, non-html and oversized responses", async () => {
    const cases = [
      fakeResponse(videoHtml, { status: 302 }),
      fakeResponse(videoHtml, { url: "https://www.made-in-china.com/video-channel/OTHER.html" }),
      fakeResponse(videoHtml, { contentType: "application/json" }),
      fakeResponse(videoHtml, { claimedBytes: 900_000 }),
    ];
    for (const first of cases) {
      const fetcher = vi.fn(async () => first);
      expect(await readCorroboratedMarketplacePrice(productUrl, productHtml, {
        enabled: true, fetcher: fetcher as typeof fetch,
      })).toBeNull();
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });

  it("drops excessively long content even without Content-Length", async () => {
    const fetcher = vi.fn(async () => fakeResponse("x".repeat(450_000)));
    expect(await readCorroboratedMarketplacePrice(productUrl, productHtml, {
      enabled: true, fetcher: fetcher as typeof fetch,
    })).toBeNull();
  });

  it("does not fetch catalog if video identity or price evidence fails", async () => {
    const fakeVideo = videoHtml.replace("<h1>What is ", "<h1>What is Different ");
    const fetcher = fakeFetcher(fakeVideo);
    expect(await readCorroboratedMarketplacePrice(productUrl, productHtml, {
      enabled: true, fetcher: fetcher as typeof fetch,
    })).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects a catalog with a related card's price or without its own MOQ", async () => {
    const fake = catalogHtml.replace("Min. Order: 1,200 Pieces", "Minimum missing");
    const fetcher = fakeFetcher(videoHtml, fake);
    expect(await readCorroboratedMarketplacePrice(productUrl, productHtml, {
      enabled: true, fetcher: fetcher as typeof fetch,
    })).toBeNull();
  });

  it("rejects unexpected catalog price changes and cross-SKU catalog cards", async () => {
    const fetcher = fakeFetcher(videoHtml, catalogHtml.replace("US $0.5-2 / Piece", "US $0.5-3 / Piece"));
    expect(await readCorroboratedMarketplacePrice(productUrl, productHtml, {
      enabled: true, fetcher: fetcher as typeof fetch,
    })).toBeNull();
    expect(parseExactCatalogPriceSource(
      catalogHtml.replace(productUrl, productUrl.replace("WJfUCnDTuekA", "OTHER123")),
      productUrl, catalogUrl,
    )).toBeNull();
  });

  it("rejects product URLs with query/hash and Dilicin pages without their own sources", async () => {
    const fetcher = fakeFetcher();
    const dilicin = "https://dilicin.en.made-in-china.com/product/jYzpeDthEMkd/China-New-Model-Senior-Reading-Glasses-High-Definition-Wholesale-From-Manufacturers-Direct-Sales-.html";
    for (const invalidUrl of [productUrl + "?sku=other", productUrl + "#related", dilicin]) {
      expect(await readCorroboratedMarketplacePrice(invalidUrl, productHtml, {
        enabled: true, fetcher: fetcher as typeof fetch,
      })).toBeNull();
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
});
