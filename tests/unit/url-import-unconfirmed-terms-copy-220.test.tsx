import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { I18nProvider } from "@/components/i18n/i18n-provider";
import { TajaPreviewBusinessSummary } from "@/components/search/taja-preview-business-summary";
import { requiresSupplierMoqConfirmation, safeCommercialFieldsForPreview } from "@/modules/product-search/domain/public-moq-review";
import type { SupplierOfferUrlPreview } from "@/modules/product-search/domain/search";

const root = join(import.meta.dirname, "../..");
const url = "https://pilotoptics.en.made-in-china.com/product/WZBfuPSTaRAU/China-Pilot-Optics-2023-Fashion-Classic-Rectangle-Anti-Blue-Light-Blocking-Reading-Glasses.html";
const catalogUrl = "https://pilotoptics.en.made-in-china.com/product-group/UejAsgVMrLhv/Reading-glasses-catalog-1.html";

const base: SupplierOfferUrlPreview = {
  title: "China Pilot Optics Fashion Classic Rectangle Anti Blue Light Blocking Reading Glasses",
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
  isPartial: true,
  titleFromSlug: false,
};

const conflict: SupplierOfferUrlPreview = {
  ...base,
  moqConflictEvidence: {
    kind: "SELLER_CATALOG_FAQ_MOQ_CONFLICT",
    productUrl: url,
    sourceUrl: catalogUrl,
    faqMinimumOrderQuantity: 1200,
    catalogMinimumOrderQuantity: 300,
    lowPrice: "0.50",
    highPrice: "2.00",
    currency: "USD",
    unit: "Piece",
    corroborated: false,
    verifiedQuote: false,
    landedCostEligible: false,
  },
};

const unverifiedFaq: SupplierOfferUrlPreview = {
  ...base,
  moqUnverifiedFaqEvidence: {
    kind: "SELLER_FAQ_MOQ_UNVERIFIED",
    productUrl: url,
    faqMinimumOrderQuantity: 1200,
    catalogVerified: false,
    verifiedQuote: false,
    landedCostEligible: false,
  },
};

function render(preview: SupplierOfferUrlPreview, locale: "sr" | "de" | "en") {
  return renderToStaticMarkup(
    <I18nProvider initialLocale={locale}>
      <TajaPreviewBusinessSummary preview={preview} requestedQuantity={300} />
    </I18nProvider>,
  );
}

describe("JAKOV360 #220 source-scoped wording, without commercial promotion", () => {
  it("reports catalog 300 versus FAQ 1200 as unconfirmed in Serbian, not missing", () => {
    const html = render(conflict, "sr");
    expect(html).toContain("cena nije potvrđena za ponudu");
    expect(html).toContain("MOQ nije potvrđen za ovaj proizvod");
    expect(html).toContain("nije obračunat — cena i MOQ nisu potvrđeni");
    expect(html).not.toContain("cena nije navedena");
    expect(html).not.toContain("MOQ nije naveden");
    expect(html).not.toContain("Mlaznice");
    expect(html).not.toContain("Pumpa");
  });

  it("distinguishes unconfirmed public terms in German and English", () => {
    const de = render(conflict, "de");
    const en = render(conflict, "en");
    expect(de).toContain("Preis für das Angebot nicht bestätigt");
    expect(de).toContain("MOQ für dieses Produkt nicht bestätigt");
    expect(de).toContain("nicht berechnet — Preis und MOQ sind nicht bestätigt");
    expect(en).toContain("offer price not confirmed");
    expect(en).toContain("MOQ not confirmed for this product");
    expect(en).toContain("not calculated — price and MOQ are unconfirmed");
  });

  it("keeps FAQ-only unverified MOQ informational when catalog is unavailable", () => {
    expect(requiresSupplierMoqConfirmation(unverifiedFaq)).toBe(true);
    const html = render(unverifiedFaq, "sr");
    expect(html).toContain("cena nije potvrđena za ponudu");
    expect(html).toContain("MOQ nije potvrđen za ovaj proizvod");
    expect(safeCommercialFieldsForPreview(unverifiedFaq)).toEqual({
      price: null,
      minimumOrderQuantity: null,
      marketplaceDetails: null,
      supplierLogistics: null,
    });
  });

  it("preserves 'not stated' for genuinely missing data without source evidence", () => {
    expect(requiresSupplierMoqConfirmation(base)).toBe(false);
    const sr = render(base, "sr");
    const de = render(base, "de");
    expect(sr).toContain("cena nije navedena");
    expect(sr).toContain("MOQ nije naveden");
    expect(de).toContain("Preis nicht angegeben");
    expect(de).toContain("MOQ nicht angegeben");
    expect(sr).not.toContain("MOQ nije potvrđen za ovaj proizvod");
  });

  it("sets only guarded price and MOQ placeholders to 'Not confirmed' in both forms", () => {
    for (const path of [
      "components/projects/create-project-from-url-form.tsx",
      "components/search/url-import-review.tsx",
    ]) {
      const source = readFileSync(join(root, path), "utf8");
      expect(source.match(/placeholder=\{requiresSupplierMoqConfirmation\(preview\) \? t\("Nije potvrđeno"\)/g)).toHaveLength(2);
      expect(source.match(/disabled=\{requiresSupplierMoqConfirmation\(preview\)\}/g)).toHaveLength(2);
      expect(source).toContain("safeCommercialFieldsForPreview(preview)");
    }
    const translations = readFileSync(join(root, "modules/i18n/translations.ts"), "utf8");
    expect(translations).toContain('en: "Not confirmed", de: "Nicht bestätigt", sr: "Nije potvrđeno"');
  });
});
