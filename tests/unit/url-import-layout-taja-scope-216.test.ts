import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "@/components/i18n/i18n-provider";
import { TajaPreviewBusinessSummary } from "@/components/search/taja-preview-business-summary";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import type { SupplierOfferUrlPreview } from "@/modules/product-search/domain/search";
import {
  buildTajaPreviewBusinessSummary,
  TajaPreviewBusinessStatuses,
  TajaPreviewLandedCostStatuses,
  TajaPreviewMoqStatuses,
  TajaPreviewPriceBasisStatuses,
} from "@/modules/product-search/domain/taja-preview-business-summary";

const root = join(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

const glasses: SupplierOfferUrlPreview = {
  title: "Pilot Optics 2023 Fashion Classic Rectangle Anti Blue Light Blocking Reading Glasses",
  supplierName: null,
  supplierCountry: null,
  price: null,
  currency: "USD",
  minimumOrderQuantity: null,
  incoterm: null,
  imageUrl: null,
  productUrl: "https://pilotoptics.en.made-in-china.com/product/WZBfuPSTaRAU/China-Pilot-Optics-2023-Fashion-Classic-Rectangle-Anti-Blue-Light-Blocking-Reading-Glasses.html",
  source: "pilotoptics.en.made-in-china.com",
  details: null,
  moqConflictEvidence: {
    kind: "SELLER_CATALOG_FAQ_MOQ_CONFLICT",
    productUrl: "https://pilotoptics.en.made-in-china.com/product/WZBfuPSTaRAU/China-Pilot-Optics-2023-Fashion-Classic-Rectangle-Anti-Blue-Light-Blocking-Reading-Glasses.html",
    sourceUrl: "https://pilotoptics.en.made-in-china.com/product-group/UejAsgVMrLhv/Reading-glasses-catalog-1.html",
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
  isPartial: true,
  titleFromSlug: false,
};

describe("JAKOV360 #216 URL import layout and TAJA scope regression", () => {
  it("makes real Pilot Optics glasses generic review, not misting system", () => {
    const result = buildTajaPreviewBusinessSummary(glasses, {
      requestedQuantity: 300,
    });
    expect(result.mistingSpecific).toBe(false);
    expect(result.status).toBe(TajaPreviewBusinessStatuses.REVIEW);
    expect(result.moqStatus).toBe(TajaPreviewMoqStatuses.UNKNOWN);
    expect(result.priceBasisStatus).toBe(TajaPreviewPriceBasisStatuses.MISSING);
    expect(result.landedCostStatus).toBe(TajaPreviewLandedCostStatuses.MISSING_PRICE);
    expect(glasses.price).toBeNull();
    expect(glasses.minimumOrderQuantity).toBeNull();
    expect(glasses.moqConflictEvidence?.catalogMinimumOrderQuantity).toBe(300);
  });

  it("does not infer misting equipment from a mismatching search query", () => {
    const result = buildTajaPreviewBusinessSummary(glasses, {
      productQuery: "water mist cooling system with pump and 20 nozzles",
      requestedQuantity: 300,
    });
    expect(result.mistingSpecific).toBe(false);
    expect(result.priceBasisStatus).toBe(TajaPreviewPriceBasisStatuses.MISSING);
    expect(result.landedCostStatus).toBe(TajaPreviewLandedCostStatuses.MISSING_PRICE);
  });
  it("keeps misting-specific review for actual system/nozzle products", () => {
    const withMist = { ...glasses, title: "High Pressure Misting System with 20 Nozzles" };
    const result = buildTajaPreviewBusinessSummary(withMist, {
      productQuery: "water mist cooling system with pump and 20 nozzles",
      requestedQuantity: 300,
    });
    expect(result.mistingSpecific).toBe(true);
    expect(result.requestedNozzleCount).toBe(20);
    expect(result.landedCostStatus).toBe(TajaPreviewLandedCostStatuses.MISSING_PRICE);
  });

  it("does not render misting equipment for glasses within a misting project", () => {
    const rendered = renderToStaticMarkup(createElement(
      I18nProvider, { initialLocale: "en", children: createElement(TajaPreviewBusinessSummary, {
        preview: glasses,
        productQuery: "water mist cooling system with pump and 20 nozzles",
        requestedQuantity: 300,
      }) },
    ));
    expect(rendered).toContain("Reading Glasses");
    expect(rendered.toLowerCase()).not.toContain("nozzles only");
    expect(rendered).not.toContain(">Nozzles<");
    expect(rendered).not.toContain(">Pump<");
  });
  it("shows product-neutral supplier questions for non-misting imports in SR/DE/EN", () => {
    // Simulate a displayed but unconfirmed price on an ordinary product.
    // Presentation must never ask about pump/nozzle quantities.
    const regularProduct: SupplierOfferUrlPreview = {
      ...glasses,
      title: "Blue light reading glasses",
      price: 0.75,
      moqConflictEvidence: null,
    };
    const cases = [
      { locale: "sr" as const, required: "Da li prikazana cena 0.75 USD", forbidden: ["mlaznic", "pumpu"] },
      { locale: "de" as const, required: "Gilt der angezeigte Preis von 0.75 USD", forbidden: ["Düse", "Pumpe"] },
      { locale: "en" as const, required: "Does the displayed price of 0.75 USD", forbidden: ["nozzle", "pump"] },
    ];
    for (const sample of cases) {
      const rendered = renderToStaticMarkup(createElement(
        I18nProvider,
        { initialLocale: sample.locale, children: createElement(TajaPreviewBusinessSummary, { preview: regularProduct, requestedQuantity: 300 }) },
      ));
      expect(rendered).toContain(sample.required);
      for (const word of sample.forbidden) {
        expect(rendered.toLowerCase()).not.toContain(word.toLowerCase());
      }
    }
  });

  it("keeps genuine misting questions product-specific", () => {
    const preview: SupplierOfferUrlPreview = {
      ...glasses, title: "High Pressure Misting System with Nozzles",
      price: 0.75, moqConflictEvidence: null,
    };
    const rendered = renderToStaticMarkup(createElement(
      I18nProvider, { initialLocale: "en", children: createElement(TajaPreviewBusinessSummary, { preview, requestedQuantity: 300 }) },
    ));
    expect(rendered).toContain("nozzle");
    expect(rendered).toContain("0.75 USD");
  });
  it("hides equipment-specific pump and nozzle rows for generic imports", () => {
    const ui = read("components/search/taja-preview-business-summary.tsx");
    expect(ui).toContain("summary.mistingSpecific && (");
    expect(ui).toContain("preview.title?.trim() || copy.formUnknownGeneric");
    expect(ui).toContain("copy.descriptionGenericReview");
    expect(ui).toContain("Pronađen je proizvod");
    expect(ui).toContain("Das Produkt wurde erkannt.");
    expect(ui).toContain("The product was identified");
  });

  it("loads scoped responsive form CSS for both URL entrypoints", () => {
    const layout = read("app/layout.tsx");
    const css = read("app/url-import-layout.css");
    const firstForm = read("components/projects/create-project-from-url-form.tsx");
    const existingForm = read("components/search/url-import-review.tsx");
    expect(layout).toContain('import "./url-import-layout.css";');
    expect(css).toContain(".url-import-form {");
    expect(css).toContain(".url-review-form {");
    expect(css).toContain(".url-first-project-fields {");
    expect(css).toContain("grid-template-columns: repeat(2, minmax(0, 1fr));");
    expect(css).toContain("grid-template-columns: repeat(3, minmax(0, 1fr));");
    expect(css).toContain("@media (max-width: 720px)");
    expect(css).toContain("grid-template-columns: minmax(0, 1fr);");
    expect(css).toContain("min-width: 0;");
    expect(firstForm).toContain('className="url-review-form"');
    expect(existingForm).toContain('className="url-review-form"');
  });

  it("renders catalog-vs-FAQ warning as a readable full-width disclosure", () => {
    const ui = read("components/search/supplier-moq-conflict-evidence.tsx");
    const css = read("app/url-import-layout.css");
    expect(ui).toContain('className="warning-text supplier-moq-evidence"');
    expect(ui).toContain("faqMinimumOrderQuantity");
    expect(ui).toContain("catalogMinimumOrderQuantity");
    expect(ui).toContain("Nijedan MOQ ni cena nisu automatski uneti");
    expect(css).toContain(".url-review-form .supplier-moq-evidence");
    expect(css).toContain(".supplier-moq-evidence dl");
    expect(css).toContain("grid-column: 1 / -1;");
  });

  it("does not weaken the source-conflict lock on any commercial fields", () => {
    const creation = read("components/projects/create-project-from-url-form.tsx");
    const existing = read("components/search/url-import-review.tsx");
    for (const form of [creation, existing]) {
      expect(form).toContain("safeCommercialFieldsForPreview(preview)");
      expect(form).toContain("disabled={requiresSupplierMoqConfirmation(preview)}");
    }
  });
});
