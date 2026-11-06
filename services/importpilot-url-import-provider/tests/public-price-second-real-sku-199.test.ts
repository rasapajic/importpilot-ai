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

// Actual captured layout: seller-wide FAQ is 1,200, while a literal "300 MOQ"
// is only found beyond a related-product boundary. It cannot be promoted.
const realLayoutHtml = primaryHtml
  .replace("US$0.50-2.00 300 Pieces (MOQ)</div>", "US$0.50-2.00</div>")
  .replace("US$0.50-2.00 1,200 Pieces (MOQ)</section>",
    "US$0.50-2.00 300 Pieces (MOQ)</section>");

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

function fakeFetch(
  sourceCatalogHtml: string, requested: string[],
  sourceProductHtml = primaryHtml, catalogStatus = 200,
) {
  return (async (input: unknown) => {
    const url = String(input);
    requested.push(url);
    if (url === secondUrl) return new Response(sourceProductHtml, {
      status: 200, headers: { "content-type": "text/html" },
    });
    if (url === catalogUrl) return new Response(sourceCatalogHtml, {
      status: catalogStatus, headers: { "content-type": "text/html" },
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

  it("does not promote an unrelated item MOQ beyond the primary boundary", () => {
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

  it("quarantines public 300 catalog MOQ versus generic 1200 FAQ without price imports", async () => {
    // This mirrors the ACTUAL ordering observed in bounded GitHub read-only
    // source probe: the visible 300 badge is after related-product markup,
    // not next to the exact main SKU's H1.
    expect(parseProductPreview(realLayoutHtml, secondUrl).minimumOrderQuantity).toBe("1200");

    const requested: string[] = [];
    const observations: string[] = [];
    const gate = createPublicPriceCanaryGate({
      enabled: true,
      canaryProductUrl: firstUrl,
      additionalProductUrlsJson: JSON.stringify([secondUrl]),
      onEvent: (event) => observations.push(event.outcome),
    });
    const preview = await previewProductUrl(secondUrl, {
      fetcher: fakeFetch(catalogHtml, requested, realLayoutHtml),
      publicPriceEvidenceEnabled: true,
      publicPriceCanaryGate: gate,
    });
    expect(preview.moqConflictEvidence).toMatchObject({
      kind: "SELLER_CATALOG_FAQ_MOQ_CONFLICT",
      productUrl: secondUrl,
      sourceUrl: catalogUrl,
      faqMinimumOrderQuantity: 1200,
      catalogMinimumOrderQuantity: 300,
      lowPrice: "0.50",
      highPrice: "2.00",
      currency: "USD",
      corroborated: false,
      verifiedQuote: false,
      landedCostEligible: false,
    });
    expect(preview.minimumOrderQuantity).toBeNull();
    expect(preview.price).toBeNull();
    expect(preview.details).toBeNull();
    expect(preview.marketplacePriceEvidence ?? null).toBeNull();
    expect(observations).toEqual(["attempt_started", "catalog_moq_conflict"]);
    expect(requested).toEqual([secondUrl, catalogUrl]); // zero video GET after conflict
  });

  it("does not trust a catalog mismatch when the primary MOQ came from exact product listing", async () => {
    const requested: string[] = [];
    const changedCatalog = catalogHtml.replace(
      "FOB Price: US $0.50-2.00 / Piece Min. Order: 300 Pieces</div>",
      "FOB Price: US $0.50-2.00 / Piece Min. Order: 400 Pieces</div>",
    );
    const preview = await previewProductUrl(secondUrl, {
      fetcher: fakeFetch(changedCatalog, requested, primaryHtml),
      publicPriceEvidenceEnabled: true,
      publicPriceCanaryGate: gate(),
    });
    expect(preview.minimumOrderQuantity).toBe("300");
    expect(preview.moqConflictEvidence ?? null).toBeNull();
    expect(preview.marketplacePriceEvidence ?? null).toBeNull();
    expect(requested).toEqual([secondUrl, catalogUrl]);
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
  it("fails closed on blocked catalog 403 and cooldown cache without retry", async () => {
    const requests: string[] = [];
    const allowed = gate();
    expect(allowed.additionalSkuNeedsSourceProof(secondUrl)).toBe(true);
    expect(allowed.additionalSkuNeedsSourceProof(firstUrl)).toBe(false);
    const fetcher = fakeFetch(catalogHtml, requests, realLayoutHtml, 403);
    const options = {
      fetcher, publicPriceEvidenceEnabled: true, publicPriceCanaryGate: allowed,
    };
    const first = await previewProductUrl(secondUrl, options);
    expect(first.moqUnverifiedFaqEvidence).toEqual({
      kind: "SELLER_FAQ_MOQ_UNVERIFIED",
      productUrl: secondUrl,
      faqMinimumOrderQuantity: 1200,
      catalogVerified: false,
      verifiedQuote: false,
      landedCostEligible: false,
    });
    expect(first.price).toBeNull();
    expect(first.minimumOrderQuantity).toBeNull();
    expect(first.details).toBeNull();
    expect(first.marketplacePriceEvidence ?? null).toBeNull();
    expect(first.moqConflictEvidence ?? null).toBeNull();
    expect(allowed.status().attemptsInCurrentWindow).toBe(1);

    const second = await previewProductUrl(secondUrl, options);
    expect(second.moqUnverifiedFaqEvidence).toEqual(first.moqUnverifiedFaqEvidence);
    // Main product preview is still available; secondary 403 is not retried.
    expect(requests).toEqual([secondUrl, catalogUrl, secondUrl]);
  });

  it("fails closed when exact seller catalog URL is missing or SKU card is absent", async () => {
    const missingLink = realLayoutHtml.replace(
      '<a href="' + catalogUrl + '">Reading glasses</a>', "",
    );
    const missingLinkRequests: string[] = [];
    const noLink = await previewProductUrl(secondUrl, {
      fetcher: fakeFetch(catalogHtml, missingLinkRequests, missingLink),
      publicPriceEvidenceEnabled: true,
      publicPriceCanaryGate: gate(),
    });
    expect(noLink.moqUnverifiedFaqEvidence?.faqMinimumOrderQuantity).toBe(1200);
    expect(noLink.minimumOrderQuantity).toBeNull();
    expect(noLink.price).toBeNull();
    expect(missingLinkRequests).toEqual([secondUrl]);

    const noSkuCatalogRequests: string[] = [];
    const firstOnlyCatalog = '<html><body><a href="' + firstUrl + '">' +
      firstTitle + '</a>FOB Price: US $0.50-2.00 / Piece Min. Order: 1,200 Pieces</body></html>';
    const noSku = await previewProductUrl(secondUrl, {
      fetcher: fakeFetch(firstOnlyCatalog, noSkuCatalogRequests, realLayoutHtml),
      publicPriceEvidenceEnabled: true,
      publicPriceCanaryGate: gate(),
    });
    expect(noSku.moqUnverifiedFaqEvidence?.catalogVerified).toBe(false);
    expect(noSku.minimumOrderQuantity).toBeNull();
    expect(noSku.price).toBeNull();
    expect(noSkuCatalogRequests).toEqual([secondUrl, catalogUrl]);
  });

  it("does not leak FAQ MOQ or teaser after the shared quota is exhausted", async () => {
    const other = "https://demooptics.en.made-in-china.com/product/ABCDEFGH1234/China-Other-Glasses.html";
    const outcomes: string[] = [];
    const allowed = createPublicPriceCanaryGate({
      enabled: true, canaryProductUrl: firstUrl,
      additionalProductUrlsJson: JSON.stringify([secondUrl, other]),
      onEvent: event => outcomes.push(event.outcome),
    });
    await allowed.getOrRead(firstUrl, async () => null);
    await allowed.getOrRead(other, async () => null);
    expect(allowed.status().attemptsInCurrentWindow).toBe(2);
    const requested: string[] = [];
    const preview = await previewProductUrl(secondUrl, {
      fetcher: fakeFetch(catalogHtml, requested, realLayoutHtml),
      publicPriceEvidenceEnabled: true,
      publicPriceCanaryGate: allowed,
    });
    expect(preview.moqUnverifiedFaqEvidence?.kind).toBe("SELLER_FAQ_MOQ_UNVERIFIED");
    expect(preview.price).toBeNull();
    expect(preview.minimumOrderQuantity).toBeNull();
    expect(preview.details).toBeNull();
    expect(requested).toEqual([secondUrl]); // quota skips catalog entirely
    expect(outcomes).toContain("global_budget_exhausted");
    expect(allowed.status().attemptsInCurrentWindow).toBe(2);
  });

  it("does not leak FAQ MOQ when another SKU is in flight", async () => {
    const allowed = gate();
    let finish = () => {};
    const pending = allowed.getOrRead(firstUrl, () => new Promise<null>(resolve => {
      finish = () => resolve(null);
    }));
    await Promise.resolve();
    expect(allowed.status().inFlight).toBe(true);
    const requested: string[] = [];
    const preview = await previewProductUrl(secondUrl, {
      fetcher: fakeFetch(catalogHtml, requested, realLayoutHtml),
      publicPriceEvidenceEnabled: true,
      publicPriceCanaryGate: allowed,
    });
    expect(preview.moqUnverifiedFaqEvidence?.catalogVerified).toBe(false);
    expect(preview.price).toBeNull();
    expect(preview.minimumOrderQuantity).toBeNull();
    expect(requested).toEqual([secondUrl]);
    finish();
    await pending;
    expect(allowed.status().inFlight).toBe(false);
  });

  it("retains fail-closed FAQ MOQ when the catalog-reading kill switch is OFF", async () => {
    const allowed = createPublicPriceCanaryGate({
      enabled: false,
      canaryProductUrl: firstUrl,
      additionalProductUrlsJson: JSON.stringify([secondUrl]),
    });
    expect(allowed.eligible(secondUrl)).toBe(false);
    expect(allowed.additionalSkuNeedsSourceProof(firstUrl)).toBe(false);
    expect(allowed.additionalSkuNeedsSourceProof(secondUrl)).toBe(true);
    const requested: string[] = [];
    const preview = await previewProductUrl(secondUrl, {
      fetcher: fakeFetch(catalogHtml, requested, realLayoutHtml),
      publicPriceEvidenceEnabled: false,
      publicPriceCanaryGate: allowed,
    });
    expect(preview.moqUnverifiedFaqEvidence?.faqMinimumOrderQuantity).toBe(1200);
    expect(preview.moqUnverifiedFaqEvidence?.catalogVerified).toBe(false);
    expect(preview.minimumOrderQuantity).toBeNull();
    expect(preview.price).toBeNull();
    expect(preview.details).toBeNull();
    expect(requested).toEqual([secondUrl]);
    expect(allowed.status().attemptsInCurrentWindow).toBe(0);
  });

});
