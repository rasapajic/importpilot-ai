import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { I18nProvider } from "../../components/i18n/i18n-provider";
import { TajaPreviewBusinessSummary } from "../../components/search/taja-preview-business-summary";
import { marketplacePublicPriceEvidenceDisplay } from "../../modules/product-search/domain/marketplace-public-price-evidence-display";
import {
  supplierOfferUrlPreviewSchema,
  type SupplierOfferUrlPreview,
} from "../../modules/product-search/domain/search";
import { createDetailedSupplierOfferUrlImportProvider } from "../../modules/product-search/infrastructure/detailed-url-import-provider";

const productUrl = "https://pilotoptics.en.made-in-china.com/product/WJfUCnDTuekA/China-Pilot-Optics-Wholesale-High-Quality-5-Colors-Custom-Logo-Square-Reading-Glasses.html";
const catalogUrl = "https://pilotoptics.en.made-in-china.com/product-group/UejAsgVMrLhv/Reading-glasses-catalog-1.html";
const videoUrl = "https://www.made-in-china.com/video-channel/pilotoptics_WJfUCnDTuekA_Pilot-Optics-Wholesale-High-Quality-5-Colors-Custom-Logo-Square-Reading-Glasses.html";

const base: SupplierOfferUrlPreview = {
  title: "Pilot Optics Wholesale High Quality 5 Colors Custom Logo Square Reading Glasses",
  supplierName: "Pilot Optics International Corp. Ltd.",
  supplierCountry: null,
  price: 0.5,
  currency: "USD",
  minimumOrderQuantity: 1200,
  incoterm: null,
  imageUrl: null,
  productUrl,
  source: "pilotoptics.en.made-in-china.com",
  details: null,
  isPartial: true,
  titleFromSlug: false,
};
const common = {
  productUrl,
  lowPrice: 0.5,
  highPrice: 2,
  currency: "USD",
  unit: "Piece" as const,
  minimumOrderQuantity: 1200,
  verifiedQuote: false as const,
};
const one = {
  ...common,
  kind: "SINGLE_SELLER_CATALOG_ADVERTISED_RANGE" as const,
  sourceUrl: catalogUrl,
  corroborated: false as const,
};
const two = {
  ...common,
  kind: "CORROBORATED_ADVERTISED_RANGE" as const,
  evidence: [videoUrl, catalogUrl] as [string, string],
};

function rendered(preview: SupplierOfferUrlPreview, locale: "sr" | "de" | "en" = "sr") {
  return renderToStaticMarkup(
    <I18nProvider initialLocale={locale}>
      <TajaPreviewBusinessSummary preview={preview} requestedQuantity={1000} />
    </I18nProvider>,
  );
}

describe("TAJA #199 public source transparency", () => {
  it("labels catalog-only data as exactly one source and never a confirmed quote", () => {
    const preview = { ...base, marketplacePriceEvidence: one };
    expect(supplierOfferUrlPreviewSchema.safeParse(preview).success).toBe(true);
    expect(marketplacePublicPriceEvidenceDisplay(preview, "sr")).toMatchObject({
      sourceCount: 1,
      sourceLinks: [{ href: catalogUrl }],
    });
    const html = rendered(preview);
    expect(html).toContain("Raspon iz kataloga dobavljača — jedan izvor");
    expect(html).toContain("0,50–2,00 USD/kom.");
    expect(html).toContain("nije pisana ponuda");
    expect(html).toContain("Katalog dobavljača");
    expect(html).toContain(catalogUrl);
    expect(html).not.toContain("Video-stranica proizvoda");
    expect(html).toContain("naveden MOQ 1200");
    expect(html).toContain("nije obračunat");
  });

  it("labels two same-platform public records without implying independent seller quotes", () => {
    const preview = { ...base, marketplacePriceEvidence: two };
    expect(supplierOfferUrlPreviewSchema.safeParse(preview).success).toBe(true);
    expect(marketplacePublicPriceEvidenceDisplay(preview, "sr")?.sourceCount).toBe(2);
    const html = rendered(preview);
    expect(html).toContain("Raspon iz dve objave iste platforme");
    expect(html).toContain("Video-stranica proizvoda");
    expect(html).toContain("Katalog dobavljača");
    expect(html).toContain(videoUrl);
    expect(html).toContain(catalogUrl);
    expect(html).toContain("nije pisana ponuda");
    expect(html).not.toContain("potvrđena ponuda dobavljača");
  });

  it("keeps labels localized in German and English", () => {
    const preview = { ...base, marketplacePriceEvidence: one };
    expect(rendered(preview, "de")).toContain("Preisspanne aus Lieferantenkatalog");
    expect(rendered(preview, "en")).toContain("Seller catalog price range");
    expect(rendered(preview, "en")).toContain("not a written quote");
    expect(marketplacePublicPriceEvidenceDisplay(preview, "en")?.range).toBe("0.50–2.00 USD/pc");
  });

  it("shows only the original teaser without optional price provenance", () => {
    expect(supplierOfferUrlPreviewSchema.safeParse(base).success).toBe(true);
    expect(marketplacePublicPriceEvidenceDisplay(base, "sr")).toBeNull();
    const html = rendered(base);
    expect(html).toContain("0.5 USD");
    expect(html).not.toContain("Raspon iz kataloga");
    expect(html).not.toContain("Izvori javno oglašene cene");
  });

  it("rejects cross-SKU/catalog, fake seller URL, price and MOQ mismatches", () => {
    const bad = [
      { ...one, sourceUrl: catalogUrl.replace("pilotoptics.en.", "another.en.") },
      { ...one, sourceUrl: catalogUrl + "?ref=other" },
      { ...one, sourceUrl: "http:" + catalogUrl.slice(6) },
      { ...one, sourceUrl: catalogUrl.replace("-catalog-1.html", "-1.html") },
      { ...one, sourceUrl: "https://attacker.example/product-group/UejAsgVMrLhv/Reading-glasses-catalog-1.html" },
      { ...one, productUrl: productUrl.replace("WJfUCnDTuekA", "ANOTHERSKU") },
      { ...one, minimumOrderQuantity: 200 },
      { ...one, currency: "EUR" },
      { ...one, lowPrice: 2, highPrice: 0.5 },
      { ...one, verifiedQuote: true },
      { ...two, evidence: [videoUrl.replace("WJfUCnDTuekA", "OTHER"), catalogUrl] },
    ];
    for (const evidence of bad) {
      const candidate = { ...base, marketplacePriceEvidence: evidence };
      expect(supplierOfferUrlPreviewSchema.safeParse(candidate).success).toBe(false);
      expect(marketplacePublicPriceEvidenceDisplay(candidate as SupplierOfferUrlPreview, "sr")).toBeNull();
    }
  });

  it("rejects conflicting legacy JSON-LD evidence instead of displaying a convenient range", () => {
    const candidate = {
      ...base, marketplacePriceEvidence: one,
      advertisedPriceRange: {
        lowPrice: 0.25, highPrice: 3, currency: "USD",
        evidence: "EXACT_PRODUCT_JSONLD" as const, unit: "Piece" as const,
        sourceUrl: productUrl,
      },
    };
    expect(supplierOfferUrlPreviewSchema.safeParse(candidate).success).toBe(false);
    expect(marketplacePublicPriceEvidenceDisplay(candidate, "sr")).toBeNull();
  });

  it("normalizes optional provider catalog evidence without altering the initial price or MOQ", async () => {
    const payload = {
      preview: {
        productTitle: base.title,
        supplierName: "Pilot Optics International Corp.Ltd.",
        price: "0.50",
        currency: "USD",
        minimumOrderQuantity: "1200",
        productUrl,
        imageUrl: null,
        marketplacePriceEvidence: {
          ...one, lowPrice: "0.5", highPrice: "2.00",
        },
      },
    };
    const fetcher = vi.fn(async () => Response.json(payload));
    const provider = createDetailedSupplierOfferUrlImportProvider({
      endpoint: "https://url-import.example/preview",
      token: "test-secret",
      fetcher: fetcher as typeof fetch,
    });
    const parsed = await provider.previewSupplierOfferUrl(productUrl);
    expect(parsed).toMatchObject({
      price: 0.5,
      minimumOrderQuantity: 1200,
      supplierName: "Pilot Optics International Corp. Ltd.",
      marketplacePriceEvidence: {
        lowPrice: 0.5, highPrice: 2, corroborated: false, verifiedQuote: false,
      },
    });
    expect(rendered(parsed)).toContain("jedan izvor");
  });

  it("drops unsupported provenance from external provider without breaking product preview", async () => {
    const fetcher = vi.fn(async () => Response.json({
      preview: {
        productTitle: base.title, productUrl, price: "0.50",
        currency: "USD", minimumOrderQuantity: "1200",
        marketplacePriceEvidence: { ...one, sourceUrl: catalogUrl + "?otherSku=yes" },
      },
    }));
    const provider = createDetailedSupplierOfferUrlImportProvider({
      endpoint: "https://url-import.example/preview",
      fetcher: fetcher as typeof fetch,
    });
    const parsed = await provider.previewSupplierOfferUrl(productUrl);
    expect(parsed.price).toBe(0.5);
    expect(parsed.marketplacePriceEvidence).toBeNull();
    expect(marketplacePublicPriceEvidenceDisplay(parsed, "sr")).toBeNull();
  });

  it("never writes public source metadata into a saved project and fits mobile layout rules", () => {
    const code = readFileSync("components/projects/create-project-from-url-form.tsx", "utf8");
    const start = code.indexOf("async function createSearch");
    const end = code.indexOf("return (", start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const creation = code.slice(start, end);
    expect(creation).not.toContain("marketplacePriceEvidence");
    expect(creation).not.toContain("advertisedPriceRange");
    const css = readFileSync("app/globals.css", "utf8");
    expect(css).toContain(".taja-preview-public-price-sources");
    expect(css).toContain("overflow-wrap: anywhere");
    expect(css).toContain("@media (max-width: 760px)");
  });
});
