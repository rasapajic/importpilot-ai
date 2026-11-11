import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/components/i18n/i18n-provider";
import { SupplierMoqConflictEvidence } from "@/components/search/supplier-moq-conflict-evidence";
import { TajaPreviewBusinessSummary } from "@/components/search/taja-preview-business-summary";
import { safeCommercialFieldsForPreview, requiresSupplierMoqConfirmation } from "@/modules/product-search/domain/public-moq-review";
import { supplierOfferUrlPreviewSchema, type SupplierOfferUrlPreview } from "@/modules/product-search/domain/search";
import { createDetailedSupplierOfferUrlImportProvider } from "@/modules/product-search/infrastructure/detailed-url-import-provider";

const url = "https://pilotoptics.en.made-in-china.com/product/WJfUCnDTuekA/China-Pilot-Optics-Wholesale-High-Quality-5-Colors-Custom-Logo-Square-Reading-Glasses.html";
const catalog = "https://pilotoptics.en.made-in-china.com/product-group/UejAsgVMrLhv/Reading-glasses-catalog-1.html";
const aligned = {
  kind: "SELLER_FAQ_CATALOG_MOQ_ALIGNED_UNCONFIRMED" as const,
  productUrl: url,
  sourceUrl: catalog,
  faqMinimumOrderQuantity: 1200,
  catalogMinimumOrderQuantity: 1200,
  lowPrice: "0.50",
  highPrice: "2.00",
  currency: "USD",
  unit: "Piece" as const,
  corroborated: false as const,
  verifiedQuote: false as const,
  landedCostEligible: false as const,
};
const preview: SupplierOfferUrlPreview = {
  title: "China Pilot Optics Wholesale High Quality 5 Colors Custom Logo Square Reading Glasses",
  supplierName: "Pilot Optics International Corp.Ltd.",
  supplierCountry: null,
  price: null,
  currency: "USD",
  minimumOrderQuantity: null,
  incoterm: null,
  imageUrl: null,
  productUrl: url,
  source: "pilotoptics.en.made-in-china.com",
  details: null,
  moqAlignedFaqEvidence: aligned,
  isPartial: true,
  titleFromSlug: false,
};
const fields = {price: null, minimumOrderQuantity: null, marketplaceDetails: null, supplierLogistics: null};

function render(locale: "sr" | "de" | "en") {
  return renderToStaticMarkup(
    <I18nProvider initialLocale={locale}>
      <SupplierMoqConflictEvidence preview={preview}/>
      <TajaPreviewBusinessSummary preview={preview} requestedQuantity={1200}/>
    </I18nProvider>,
  );
}

describe("JAKOV360 #221 first original public SKU is not a confirmed quote", () => {
  it("strictly disallows price/MOQ/tier promotion even when FAQ and catalog agree", () => {
    expect(supplierOfferUrlPreviewSchema.safeParse(preview).success).toBe(true);
    expect(requiresSupplierMoqConfirmation(preview)).toBe(true);
    expect(safeCommercialFieldsForPreview(preview)).toEqual(fields);
    // Even manually modified stale form state cannot become a priced offer.
    expect(safeCommercialFieldsForPreview({
      ...preview, price: 0.5, minimumOrderQuantity: 1200,
    })).toEqual(fields);
    expect(supplierOfferUrlPreviewSchema.safeParse({...preview, price: 0.5}).success).toBe(false);
    expect(supplierOfferUrlPreviewSchema.safeParse({...preview, minimumOrderQuantity: 1200}).success).toBe(false);
    expect(supplierOfferUrlPreviewSchema.safeParse({...preview, details: {priceTiers: []}}).success).toBe(false);
  });

  it("rejects a forged catalog source, SKU, number disagreement or confirmed-quote flag", () => {
    const variations = [
      {sourceUrl: catalog.replace("pilotoptics", "other-seller")},
      {productUrl: url.replace("WJfUCnDTuekA", "WZBfuPSTaRAU")},
      {catalogMinimumOrderQuantity: 300},
      {verifiedQuote: true},
      {landedCostEligible: true},
    ];
    for (const change of variations) {
      expect(supplierOfferUrlPreviewSchema.safeParse({
        ...preview, moqAlignedFaqEvidence: {...aligned, ...change},
      }).success).toBe(false);
    }
    expect(supplierOfferUrlPreviewSchema.safeParse({
      ...preview,
      moqAlignedFaqEvidence: aligned,
      moqConflictEvidence: {
        ...aligned,
        kind: "SELLER_CATALOG_FAQ_MOQ_CONFLICT",
        catalogMinimumOrderQuantity: 300,
      },
    }).success).toBe(false);
  });

  it("renders public 1,200/1,200 and USD 0.50–2.00 as informational only in Serbian", () => {
    const html = render("sr");
    expect(html).toContain("FAQ i katalog navode isti MOQ");
    expect(html).toContain("Opšti FAQ dobavljača");
    expect(html).toContain("Katalog ovog proizvoda");
    expect(html).toContain("1.200");
    expect(html).toContain("0,50–2,00");
    expect(html).toContain("Polja za cenu i MOQ su zaključana");
    expect(html).toContain("cena nije potvrđena za ponudu");
    expect(html).toContain("MOQ nije potvrđen za ovaj proizvod");
    expect(html).toContain("nije obračunat — cena i MOQ nisu potvrđeni");
    expect(html).not.toContain("Pumpa");
    expect(html).not.toContain("Mlaznice");
  });

  it("renders explicit uncertainty on DE and EN locale without a confirmed sales offer", () => {
    expect(render("de")).toContain("FAQ und Katalog nennen dieselbe MOQ");
    expect(render("en")).toContain("FAQ and catalog agree on MOQ");
    for (const locale of ["de", "en"] as const) {
      const html = render(locale);
      expect(html).toMatch(locale === "de" ? /1[.\u00a0\u202f\s]200/ : /1,200/);
      expect(html).not.toContain("Pumpa");
    }
  });

  it("keeps both URL import forms locked for this source review state", () => {
    const root = join(import.meta.dirname, "../..");
    for (const path of [
      "components/projects/create-project-from-url-form.tsx",
      "components/search/url-import-review.tsx",
    ]) {
      const content = readFileSync(join(root, path), "utf8");
      expect(content.match(/disabled=\{requiresSupplierMoqConfirmation\(preview\)\}/g)).toHaveLength(2);
      expect(content).toContain("safeCommercialFieldsForPreview(preview)");
    }
  });

  it("passes an unpriced, source-scoped first SKU through actual external preview normalization", async () => {
    const provider = createDetailedSupplierOfferUrlImportProvider({
      endpoint: "https://provider.invalid/preview",
      fetcher: vi.fn(async () => Response.json({preview: {
        productTitle: preview.title,
        supplierName: preview.supplierName,
        productUrl: url,
        price: null,
        currency: "USD",
        minimumOrderQuantity: null,
        incoterm: null,
        imageUrl: null,
        details: null,
        moqAlignedFaqEvidence: aligned,
      }})) as typeof fetch,
    });
    const result = await provider.previewSupplierOfferUrl(url);
    expect(result.moqAlignedFaqEvidence).toEqual(aligned);
    expect(result.minimumOrderQuantity).toBeNull();
    expect(result.price).toBeNull();
    expect(safeCommercialFieldsForPreview(result)).toEqual(fields);
  });
});
