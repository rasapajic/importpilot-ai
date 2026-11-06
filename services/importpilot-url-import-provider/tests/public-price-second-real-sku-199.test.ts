import { describe, expect, it } from "vitest";
import { parseProductPreview } from "../src/parser.js";
import {
  discoverExactSellerCatalogUrl,
  parseExactCatalogPriceSource,
  parseExactVideoPriceSource,
} from "../src/marketplace-price-source-parser.js";
import { createPublicPriceCanaryGate } from "../src/public-price-canary-policy.js";
import { previewProductUrl } from "../src/fetcher.js";

// Real published SKU URLs, but every HTTP response in this test is SYNTHETIC.
// No marketplace requests, supplier outreach, RFQs, production access or deployment.
const firstUrl =
  "https://pilotoptics.en.made-in-china.com/product/WJfUCnDTuekA/China-Pilot-Optics-Wholesale-High-Quality-5-Colors-Custom-Logo-Square-Reading-Glasses.html";
const secondUrl =
  "https://pilotoptics.en.made-in-china.com/product/WZBfuPSTaRAU/China-Pilot-Optics-2023-Fashion-Classic-Rectangle-Anti-Blue-Light-Blocking-Reading-Glasses.html";
const secondTitle = "Pilot Optics 2023 Fashion Classic Rectangle Anti Blue Light Blocking Reading Glasses";
const firstTitle = "Pilot Optics Wholesale High Quality 5 Colors Custom Logo Square Reading Glasses";
const catalogUrl =
  "https://pilotoptics.en.made-in-china.com/product-group/UejAsgVMrLhv/Reading-glasses-catalog-1.html";
const secondVideo =
  "https://www.made-in-china.com/video-channel/pilotoptics_WZBfuPSTaRAU_Pilot-Optics-2023-Fashion-Classic-Rectangle-Anti-Blue-Light-Blocking-Reading-Glasses.html";

const primaryHtml =
  '<html><head><meta property="og:title" content="' + secondTitle + '">' +
  '<script type="application/ld+json">{"minimumOrderQuantity":"1200","price":"0.50","currency":"USD"}</script>' +
  '</head><body><h1>' + secondTitle + '</h1>' +
  '<a href="https://pilotoptics.en.made-in-china.com">Pilot Optics International Corp.Ltd.Wenzhou</a>' +
  '<div class="product-main-price">US$0.50-2.00 300 Pieces (MOQ)</div>' +
  '<a href="' + catalogUrl + '">Reading glasses</a>' +
  '<section class="related-product"><a href="' + firstUrl + '">' + firstTitle + '</a>' +
  'US$0.50-2.00 1,200 Pieces (MOQ)</section>' +
  '<section class="product-description">FAQ' +
  "<p>Q3: what's your MOQ?</p>" +
  '<p>A3:1200 pcs per item,for some optical frame,only 300pcs per item per color.</p>' +
  '</section></body></html>';

const catalogHtml =
  '<html><body><div class="product-card"><a href="' + firstUrl + '">' + firstTitle + '</a>' +
  ' FOB Price: US $0.50-2.00 / Piece Min. Order: 1,200 Pieces</div>' +
  '<div class="product-card"><a href="' + secondUrl + '">' + secondTitle + '</a>' +
  ' FOB Price: US $0.50-2.00 / Piece Min. Order: 300 Pieces</div></body></html>';

function gate() {
  return createPublicPriceCanaryGate({
    enabled: true,
    canaryProductUrl: firstUrl,
    additionalProductUrlsJson: JSON.stringify([secondUrl]),
  });
}

function fakeFetch(sourceCatalogHtml: string, requested: string[]) {
  return (async (input: unknown) => {
    const url = String(input);
    requested.push(url);
    if (url === secondUrl) return new Response(primaryHtml, {
      status: 200, headers: { "content-type": "text/html" },
    });
    if (url === catalogUrl) return new Response(sourceCatalogHtml, {
      status: 200, headers: { "content-type": "text/html" },
    });
    if (url === secondVideo) return new Response("Forbidden", {
      status: 403, headers: { "content-type": "text/html" },
    });
    throw new Error("Unexpected marketplace URL in a bounded mock");
  }) as typeof fetch;
}

describe("JAKOV360 #199 second real SKU candidate (offline regression fixtures)", () => {
  it("prefers exact SKU 300-piece listing over generic FAQ and stale JSON 1200", () => {
    const parsed = parseProductPreview(primaryHtml, secondUrl);
    expect(parsed.minimumOrderQuantity).toBe("300");
    expect(parsed.price).toBe("0.50");
    expect(parsed.supplierName).toContain("Pilot Optics International");
    expect(discoverExactSellerCatalogUrl(primaryHtml, secondUrl)).toBe(catalogUrl);
  });

  it("finds the main MOQ beyond the old 2.5 KB window without reading related cards", () => {
    // Real HTML places the exact product's MOQ behind lengthy main-listing markup.
    const spaced = primaryHtml.replace(
      '<div class="product-main-price">',
      '<section class="product-gallery">' + 'x'.repeat(3500) +
        '</section><div class="product-main-price">',
    );
    expect(parseProductPreview(spaced, secondUrl).minimumOrderQuantity).toBe("300");
  });

  it("does not promote an unrelated item's MOQ within the larger window", () => {
    const unrelatedOnly = primaryHtml
      .replace('US$0.50-2.00 300 Pieces (MOQ)', 'US$0.50-2.00')
      .replace('1,200 Pieces (MOQ)</section>', '777 Pieces (MOQ)</section>');
    // With no exact main-listing marker, retain the generic FAQ, never 777.
    expect(parseProductPreview(unrelatedOnly, secondUrl).minimumOrderQuantity).toBe("1200");
  });

  it("abstains on conflicting primary product MOQ values", () => {
    const contradiction = primaryHtml.replace(
      "US$0.50-2.00 300 Pieces (MOQ)",
      "US$0.50-2.00 300 Pieces (MOQ) / 1,200 Pieces (MOQ)",
    );
    expect(parseProductPreview(contradiction, secondUrl).minimumOrderQuantity).toBeNull();
  });

  it("isolates exact second SKU catalog evidence from adjacent first SKU", () => {
    expect(parseExactCatalogPriceSource(catalogHtml, secondUrl, catalogUrl)).toMatchObject({
      productUrl: secondUrl,
      minimumOrderQuantity: 300,
      lowPrice: "0.50",
      highPrice: "2.00",
      currency: "USD",
      unit: "Piece",
    });
    expect(parseExactVideoPriceSource(
      "<h1>" + firstTitle + "</h1>" +
      "<div>Min. Order Reference FOB Price 1,200 Pieces US$0.50-2.00 / Piece</div>",
      secondUrl, secondVideo,
    )).toBeNull();
  });

  it("returns unconfirmed second SKU catalog evidence on simulated video 403", async () => {
    const requested: string[] = [];
    const allowed = gate();
    expect(allowed.eligible(firstUrl)).toBe(true);
    expect(allowed.eligible(secondUrl)).toBe(true);
    expect(allowed.status().allowedProducts).toBe(2);
    const preview = await previewProductUrl(secondUrl, {
      fetcher: fakeFetch(catalogHtml, requested),
      publicPriceEvidenceEnabled: true,
      publicPriceCanaryGate: allowed,
    });
    expect(preview.minimumOrderQuantity).toBe("300");
    expect(preview.marketplacePriceEvidence).toMatchObject({
      kind: "SINGLE_SELLER_CATALOG_ADVERTISED_RANGE",
      productUrl: secondUrl,
      minimumOrderQuantity: 300,
      lowPrice: "0.50",
      highPrice: "2.00",
      corroborated: false,
      verifiedQuote: false,
    });
    expect(requested).toEqual([secondUrl, catalogUrl, secondVideo]);
  });

  it("refuses first-SKU-only catalog prices instead of borrowing MOQ 1200", async () => {
    const requested: string[] = [];
    const firstOnly =
      '<html><body><a href="' + firstUrl + '">' + firstTitle + '</a>' +
      'FOB Price: US $0.50-2.00 / Piece Min. Order: 1,200 Pieces</body></html>';
    const preview = await previewProductUrl(secondUrl, {
      fetcher: fakeFetch(firstOnly, requested),
      publicPriceEvidenceEnabled: true,
      publicPriceCanaryGate: gate(),
    });
    expect(preview.minimumOrderQuantity).toBe("300");
    expect(preview.marketplacePriceEvidence ?? null).toBeNull();
    expect(requested).toEqual([secondUrl, catalogUrl]);
  });
});
