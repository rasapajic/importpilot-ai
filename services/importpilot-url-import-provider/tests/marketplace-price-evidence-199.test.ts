import { describe, expect, it } from "vitest";
import {
  reconcileMarketplacePriceEvidence,
  type MarketplacePriceEvidence,
} from "../src/marketplace-price-evidence.js";

const url = "https://pilotoptics.en.made-in-china.com/product/WJfUCnDTuekA/China-Pilot-Optics-Wholesale-High-Quality-5-Colors-Custom-Logo-Square-Reading-Glasses.html";
const video = "https://www.made-in-china.com/video-channel/pilotoptics_WJfUCnDTuekA_Pilot-Optics-Wholesale-High-Quality-5-Colors-Custom-Logo-Square-Reading-Glasses.html";
const catalog = "https://pilotoptics.en.made-in-china.com/product-group/UejAsgVMrLhv/Reading-glasses-catalog-1.html";
const title = "Pilot Optics Wholesale High Quality 5 Colors Custom Logo Square Reading Glasses";

function evidence(kind: MarketplacePriceEvidence["kind"]): MarketplacePriceEvidence {
  return {
    kind,
    sourceUrl: kind === "VIDEO_CHANNEL" ? video : catalog,
    productUrl: url,
    productTitle: title,
    supplierSlug: "pilotoptics",
    lowPrice: "0.50",
    highPrice: "2.00",
    currency: "USD",
    unit: "Piece",
    minimumOrderQuantity: 1_200,
  };
}

describe("exact-SKU corroboration, advertisement not written quote #199", () => {
  it("reconciles the two same-SKU public sources without promoting a firm quote", () => {
    expect(reconcileMarketplacePriceEvidence(url, [evidence("VIDEO_CHANNEL"), evidence("SUPPLIER_CATALOG")]))
      .toEqual({
        kind: "CORROBORATED_ADVERTISED_RANGE",
        productUrl: url,
        lowPrice: "0.50",
        highPrice: "2.00",
        currency: "USD",
        unit: "Piece",
        minimumOrderQuantity: 1200,
        evidence: [video, catalog],
        verifiedQuote: false,
      });
  });
  it("requires two different source types, never a lone video or related card", () => {
    expect(reconcileMarketplacePriceEvidence(url, [evidence("VIDEO_CHANNEL")])).toBeNull();
    expect(reconcileMarketplacePriceEvidence(url, [
      evidence("VIDEO_CHANNEL"), { ...evidence("VIDEO_CHANNEL"), sourceUrl: video },
    ])).toBeNull();
  });
  it("rejects cross-SKU catalog and misleading matching text with mismatched identifier", () => {
    const other = {
      ...evidence("SUPPLIER_CATALOG"),
      productUrl: url.replace("WJfUCnDTuekA", "ANOTHERSKU"),
    };
    expect(reconcileMarketplacePriceEvidence(url, [evidence("VIDEO_CHANNEL"), other])).toBeNull();
  });
  it("rejects a different seller, outside domains and same-SKU mismatched video link", () => {
    for (const override of [
      { supplierSlug: "another-seller" },
      { sourceUrl: "https://example.org/product-group/UejAsgVMrLhv/Reading-glasses-catalog-1.html" },
      { sourceUrl: catalog.replace("pilotoptics.en.", "othercompany.en.") },
    ]) {
      expect(reconcileMarketplacePriceEvidence(url, [
        evidence("VIDEO_CHANNEL"), { ...evidence("SUPPLIER_CATALOG"), ...override },
      ])).toBeNull();
    }
    expect(reconcileMarketplacePriceEvidence(url, [
      { ...evidence("VIDEO_CHANNEL"), sourceUrl: video.replace("WJfUCnDTuekA", "ANOTHERSKU") },
      evidence("SUPPLIER_CATALOG"),
    ])).toBeNull();
  });
  it("rejects price/MOQ divergence, unverified currency and incoherent amounts", () => {
    for (const override of [
      { highPrice: "3.00" },
      { lowPrice: "0.25" },
      { currency: "EUR" },
      { minimumOrderQuantity: 200 },
      { highPrice: "0.40" },
      { highPrice: "not-a-price" },
      { unit: "Set" as const },
    ]) {
      expect(reconcileMarketplacePriceEvidence(url, [
        evidence("VIDEO_CHANNEL"), { ...evidence("SUPPLIER_CATALOG"), ...override },
      ])).toBeNull();
    }
  });
  it("rejects loose product-title matches, even with identical prices", () => {
    expect(reconcileMarketplacePriceEvidence(url, [
      evidence("VIDEO_CHANNEL"),
      { ...evidence("SUPPLIER_CATALOG"), productTitle: "Pilot Optics 2023 Fashion Square OEM Reading Glasses" },
    ])).toBeNull();
  });
  it("rejects URL userinfo, query, fragments and insecure HTTPS downgrade", () => {
    for (const sourceUrl of [
      catalog + "?product=WJfUCnDTuekA",
      catalog + "#related",
      "http://" + catalog.slice("https://".length),
      catalog.replace("https://", "https://attacker@"),
    ]) {
      expect(reconcileMarketplacePriceEvidence(url, [
        evidence("VIDEO_CHANNEL"), { ...evidence("SUPPLIER_CATALOG"), sourceUrl },
      ])).toBeNull();
    }
  });
  it("rejects Dilicin teaser and MOQ 1,200 when video/catalog sources are for Pilot Optics", () => {
    const dilicinUrl = "https://dilicin.en.made-in-china.com/product/jYzpeDthEMkd/China-New-Model-Senior-Reading-Glasses-High-Definition-Wholesale-From-Manufacturers-Direct-Sales-.html";
    expect(reconcileMarketplacePriceEvidence(dilicinUrl, [
      evidence("VIDEO_CHANNEL"), evidence("SUPPLIER_CATALOG"),
    ])).toBeNull();
  });
});
