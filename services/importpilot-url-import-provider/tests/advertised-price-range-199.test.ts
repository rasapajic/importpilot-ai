import { describe, expect, it } from "vitest";
import {
  extractExactProductAdvertisedPriceRange,
  parseProductPreview,
} from "../src/parser.js";

const pilotUrl = "https://pilotoptics.en.made-in-china.com/product/WJfUCnDTuekA/China-Pilot-Optics-Wholesale-High-Quality-5-Colors-Custom-Logo-Square-Reading-Glasses.html";
const otherUrl = "https://pilotoptics.en.made-in-china.com/product/OTHER/China-Different-Reading-Glasses.html";

function htmlWithStructuredProduct(product: object | null, extras = "") {
  const ld = product === null ? "" :
    '<script type="application/ld+json">' + JSON.stringify(product) + "</script>";
  return '<html><head><meta property="og:title" content="Pilot Optics Wholesale Reading Glasses">' +
    '<meta property="og:image" content="https://image.made-in-china.com/glasses.jpg">' +
    ld + '<script>{"minimumOrderQuantity":"200","price":"0.50","currency":"USD"}</script>' +
    '</head><body><h1>Pilot Optics Wholesale Reading Glasses</h1>' +
    "<p>Q3: what's your MOQ?</p><p>A3:1200 pcs per item</p>" +
    extras + "</body></html>";
}

function aggregate(url = pilotUrl, price: Record<string, unknown> = {}) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    url,
    name: "Pilot Optics Reading Glasses",
    offers: {
      "@type": "AggregateOffer",
      lowPrice: "0.50",
      highPrice: "2.00",
      priceCurrency: "USD",
      unitText: "Piece",
      ...price,
    },
  };
}

describe("source-anchored advertised price range #199", () => {
  it("does NOT steal 0.50–2.00 from recommendation cards on Pilot Optics", () => {
    const unrelatedCards =
      '<section><h2>People who viewed this also viewed</h2>' +
      '<a href="' + otherUrl + '">Other reading glasses</a>' +
      "<p>US$0.50-2.00 / Piece</p></section>";
    const preview = parseProductPreview(htmlWithStructuredProduct(null, unrelatedCards), pilotUrl);
    expect(preview.advertisedPriceRange).toBeNull();
    expect(preview.minimumOrderQuantity).toBe("1200");
    expect(preview.price).toBe("0.50");
  });

  it("accepts only AggregateOffer with EXACT product identity, price bounds, currency and unit", () => {
    const html = htmlWithStructuredProduct(
      aggregate(), "<section>People who viewed this also viewed: US$0.02-0.08 / Piece</section>",
    );
    const preview = parseProductPreview(html, pilotUrl);
    expect(preview.advertisedPriceRange).toEqual({
      lowPrice: "0.50",
      highPrice: "2.00",
      currency: "USD",
      unit: "Piece",
      evidence: "EXACT_PRODUCT_JSONLD",
      sourceUrl: pilotUrl,
    });
    expect(preview.price).toBe("0.50");
    expect(preview.minimumOrderQuantity).toBe("1200");
  });

  it("rejects a different SKU even when included in a JSON-LD @graph", () => {
    const graph = {
      "@context": "https://schema.org",
      "@graph": [aggregate(otherUrl), { "@type": "WebSite", url: pilotUrl }],
    };
    expect(parseProductPreview(htmlWithStructuredProduct(graph), pilotUrl).advertisedPriceRange).toBeNull();
  });

  it("rejects an offer URL mismatching the same product node", () => {
    const product = aggregate(pilotUrl, { url: otherUrl });
    expect(parseProductPreview(htmlWithStructuredProduct(product), pilotUrl).advertisedPriceRange).toBeNull();
  });

  it("rejects no currency, no high price, invalid decimals and inverted bounds", () => {
    for (const variation of [
      { priceCurrency: null },
      { highPrice: null },
      { lowPrice: "3.00", highPrice: "2.00" },
      { highPrice: "2,00" },
    ]) {
      expect(extractExactProductAdvertisedPriceRange(
        htmlWithStructuredProduct(aggregate(pilotUrl, variation)), pilotUrl,
      )).toBeNull();
    }
  });

  it("does not combine variant offers or unproven quantity ladders", () => {
    const product = aggregate();
    const combined = { ...product, offers: [product.offers, { ...product.offers, lowPrice: "0.75" }] };
    expect(parseProductPreview(htmlWithStructuredProduct(combined), pilotUrl).advertisedPriceRange).toBeNull();
    const tierHtml = htmlWithStructuredProduct(
      { "@type": "Product", url: pilotUrl, offers: { "@type": "Offer", price: "0.80", priceCurrency: "USD" } },
      "<div>US$0.85 100-999 Pieces</div><div>US$0.70 1,000-9,999 Pieces</div>",
    );
    expect(parseProductPreview(tierHtml, pilotUrl).advertisedPriceRange).toBeNull();
  });

  it("does not fabricate a Dilicin price range from teaser US$0.18 and MOQ 1,200", () => {
    const dilicinUrl = "https://dilicin.en.made-in-china.com/product/jYzpeDthEMkd/China-New-Model-Senior-Reading-Glasses-High-Definition-Wholesale-From-Manufacturers-Direct-Sales-.html";
    const html = '<html><head><meta property="og:title" content="New Model Senior Reading Glasses"></head>' +
      "<body><h1>New Model Senior Reading Glasses</h1><p>US$0.18</p><p>1,200 Pieces (MOQ)</p>" +
      "<section>People who viewed this also viewed: US$0.18-0.53 / Piece</section></body></html>";
    const preview = parseProductPreview(html, dilicinUrl);
    expect(preview.minimumOrderQuantity).toBe("1200");
    expect(preview.advertisedPriceRange).toBeNull();
  });
});
