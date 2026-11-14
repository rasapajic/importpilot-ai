import { describe, expect, it, vi } from "vitest";
import { extractSupplierName, parseProductPreview } from "../src/parser.js";
import {
  exactMadeInChinaProductIdentity,
  expectedVideoSourceUrl,
  parseExactVideoPriceSource,
  parseExactCatalogPriceSource,
  discoverExactSellerCatalogUrl,
} from "../src/marketplace-price-source-parser.js";
import {
  readMarketplacePublicPriceEvidence,
} from "../src/marketplace-price-source-reader.js";
import {
  reconcileMarketplacePriceEvidence,
} from "../src/marketplace-price-evidence.js";

const productUrl = "https://dilicn.en.made-in-china.com/product/jYzpeDtbEMkd/China-New-Model-Senior-Reading-Glasses-High-Definition-Wholesale-From-Manufacturers-Direct-Sales-.html";
const videoUrl = "https://www.made-in-china.com/video-channel/dilicn_jYzpeDtbEMkd_New-Model-Senior-Reading-Glasses-High-Definition-Wholesale-From-Manufacturers-Direct-Sales-.html";
const oldMistypedProductUrl = "https://dilicin.en.made-in-china.com/product/jYzpeDthEMkd/China-New-Model-Senior-Reading-Glasses-High-Definition-Wholesale-From-Manufacturers-Direct-Sales-.html";
const otherProductUrl = "https://dilicn.en.made-in-china.com/product/HbNpYmAKsTWh/China-New-Model-Senior-Reading-Glasses-for-Both-Men-and-Women-High-Definition-Wholesale-From-Manufacturers-Direct-Sales-.html";
const fakeCatalogUrl = "https://dilicn.en.made-in-china.com/product-group/ABCDEFGH/Reading-Glasses-catalog-1.html";

const exactName = "New Model Senior Reading Glasses High-Definition Wholesale From Manufacturers Direct Sales.";
const videoSingle = '<html><body><h1>What is ' + exactName +
  '</h1><section>Min. Order Reference FOB Price 1,200 Pieces US$0.18 / Piece</section>' +
  '<section>Related product: US$0.53 / Piece, 1,200 Pieces</section></body></html>';
const exactCard = '<a href="' + productUrl + '">' + exactName + '</a>' +
  '<span>FOB Price: US$0.18 / Piece</span><span>Min. Order: 1,200 Pieces</span>';
const relatedCard = '<a href="' + otherProductUrl + '">New Model Senior Reading Glasses for Both Men and Women</a>' +
  '<span>FOB Price: US$0.53 / Piece</span><span>Min. Order: 1,200 Pieces</span>';

describe("JAKOV360 #199 separate Dilicn SKU and single-price safety", () => {
  it("uses the corrected supplier spelling and exact SKU, not the old typo", () => {
    expect(exactMadeInChinaProductIdentity(productUrl)).toMatchObject({
      seller: "dilicn", sku: "jYzpeDtbEMkd",
      productUrl,
    });
    expect(expectedVideoSourceUrl(productUrl)).toBe(videoUrl);
    expect(expectedVideoSourceUrl(oldMistypedProductUrl)).not.toBe(videoUrl);
    expect(exactMadeInChinaProductIdentity(productUrl)?.seller).not.toBe("pilotoptics");
  });

  it("prefers the linked Dilicn seller legal name over generic manufacturer SEO metadata", () => {
    const html = '<html><head><script type="application/ld+json">' +
      '{"manufacturerName":"New Design Eyewear Manufacturer","price":"0.18"}</script>' +
      '</head><body>' +
      '<h1>' + exactName + '</h1>' +
      '<a href="https://dilicn.en.made-in-china.com/">Wenzhou Dilicn Optical Co., Ltd</a>' +
      '<p>1,200 Pieces (MOQ)</p>' +
      '<p>Related products 0.53 USD</p>' +
      '</body></html>';
    expect(extractSupplierName(html, productUrl)).toBe("Wenzhou Dilicn Optical Co., Ltd");
    const preview = parseProductPreview(html, productUrl);
    expect(preview.supplierName).toBe("Wenzhou Dilicn Optical Co., Ltd");
    expect(preview.minimumOrderQuantity).toBe("1200");
    expect(preview.price).toBe("0.18");
  });

  it("never treats a recommendation from another seller as a verified supplier homepage", () => {
    const html = '<head><script>{"manufacturerName":"New Design Eyewear Manufacturer"}</script></head>' +
      '<a href="https://otheroptic.en.made-in-china.com/">Other Optical Co., Ltd</a>' +
      '<a href="https://dilicn.en.made-in-china.com/product/Another123/China-Other-Glasses.html">' +
      'Unrelated Eyewear Co., Ltd</a>';
    const extracted = extractSupplierName(html, productUrl);
    expect(extracted).not.toBe("Other Optical Co., Ltd");
    expect(extracted).not.toBe("Unrelated Eyewear Co., Ltd");
  });

  it("keeps the exact Pilot Optics homepage legal seller and does not change MOQ", () => {
    const pilot = "https://pilotoptics.en.made-in-china.com/product/WJfUCnDTuekA/China-Pilot-Optics-Wholesale-High-Quality-5-Colors-Custom-Logo-Square-Reading-Glasses.html";
    const html = '<script>{"manufacturerName":"New Design Eyewear Manufacturer"}</script>' +
      '<a href="https://pilotoptics.en.made-in-china.com/">Pilot Optics International Corp. Ltd.</a>' +
      '<p>1,200 Pieces (MOQ)</p>';
    expect(extractSupplierName(html, pilot)).toBe("Pilot Optics International Corp. Ltd.");
    expect(parseProductPreview(html, pilot).minimumOrderQuantity).toBe("1200");
  });

  it("does not turn publicly advertised US$0.18/Piece into an invented price interval", () => {
    expect(parseExactVideoPriceSource(videoSingle, productUrl, videoUrl)).toBeNull();
    expect(parseExactCatalogPriceSource(
      '<html><body>' + exactCard + relatedCard + '</body></html>',
      productUrl, fakeCatalogUrl,
    )).toBeNull();
  });

  it("rejects a related model at US$0.53 even when MOQ and some title words match", () => {
    const catalog = '<html><body><div>' + relatedCard + '</div></body></html>';
    expect(parseExactCatalogPriceSource(catalog, productUrl, fakeCatalogUrl)).toBeNull();
    expect(parseExactVideoPriceSource(videoSingle, otherProductUrl, videoUrl)).toBeNull();
    expect(parseExactVideoPriceSource(videoSingle, productUrl, videoUrl.replace("jYzpeDtbEMkd", "OTHER123456"))).toBeNull();
  });

  it("does not treat Dilicn source evidence as Pilot Optics evidence", () => {
    const pilotUrl = "https://pilotoptics.en.made-in-china.com/product/WJfUCnDTuekA/China-Pilot-Optics-Wholesale-High-Quality-5-Colors-Custom-Logo-Square-Reading-Glasses.html";
    const candidates = [{
      kind: "VIDEO_CHANNEL" as const,
      productUrl, sourceUrl: videoUrl,
      productTitle: exactName, supplierSlug: "dilicn",
      lowPrice: "0.18", highPrice: "0.53",
      currency: "USD", unit: "Piece" as const,
      minimumOrderQuantity: 1200,
    }, {
      kind: "SUPPLIER_CATALOG" as const,
      productUrl, sourceUrl: fakeCatalogUrl,
      productTitle: exactName, supplierSlug: "dilicn",
      lowPrice: "0.18", highPrice: "0.53",
      currency: "USD", unit: "Piece" as const,
      minimumOrderQuantity: 1200,
    }];
    expect(reconcileMarketplacePriceEvidence(pilotUrl, candidates)).toBeNull();
    // Even a fabricated "range" from 0.18 to a related SKU's 0.53
    // must never be accepted as a quote.
    expect(reconcileMarketplacePriceEvidence(productUrl, [
      { ...candidates[0], supplierSlug: "pilotoptics" }, candidates[1],
    ])).toBeNull();
  });

  it("never fetches another seller's pages on a missing catalog or other SKU", async () => {
    const mainHtml = '<html><body><h1>' + exactName + '</h1>' +
      '<a href="https://pilotoptics.en.made-in-china.com/product-group/ABCDEFGH/Reading-Glasses-catalog-1.html">Reading Glasses</a>' +
      '</body></html>';
    const fetcher = vi.fn(async () => new Response("should not fetch"));
    expect(discoverExactSellerCatalogUrl(mainHtml, productUrl)).toBeNull();
    expect(await readMarketplacePublicPriceEvidence(productUrl, mainHtml, 1200, {
      enabled: true, fetcher: fetcher as typeof fetch,
    })).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
