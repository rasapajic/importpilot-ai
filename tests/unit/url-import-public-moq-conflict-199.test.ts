import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { supplierOfferUrlPreviewSchema } from "@/modules/product-search/domain/search";
import {
  requiresSupplierMoqConfirmation,
  safeCommercialFieldsForPreview,
} from "@/modules/product-search/domain/public-moq-review";
import {
  buildTajaPreviewBusinessSummary,
  TajaPreviewLandedCostStatuses,
  TajaPreviewMoqStatuses,
  TajaPreviewPriceBasisStatuses,
} from "@/modules/product-search/domain/taja-preview-business-summary";
import {
  createDetailedSupplierOfferUrlImportProvider,
} from "@/modules/product-search/infrastructure/detailed-url-import-provider";

const url =
  "https://pilotoptics.en.made-in-china.com/product/WZBfuPSTaRAU/China-Pilot-Optics-2023-Fashion-Classic-Rectangle-Anti-Blue-Light-Blocking-Reading-Glasses.html";
const catalog =
  "https://pilotoptics.en.made-in-china.com/product-group/UejAsgVMrLhv/Reading-glasses-catalog-1.html";

const conflict = {
  kind: "SELLER_CATALOG_FAQ_MOQ_CONFLICT" as const,
  productUrl: url,
  sourceUrl: catalog,
  faqMinimumOrderQuantity: 1200,
  catalogMinimumOrderQuantity: 300,
  lowPrice: "0.50",
  highPrice: "2.00",
  currency: "USD",
  unit: "Piece" as const,
  corroborated: false as const,
  verifiedQuote: false as const,
  landedCostEligible: false as const,
};

const exactProviderPreview = {
  productTitle: "Pilot Optics 2023 Fashion Classic Rectangle Anti Blue Light Blocking Reading Glasses",
  supplierName: "Pilot Optics International Corp. Ltd.",
  price: null,
  currency: "USD",
  minimumOrderQuantity: null,
  incoterm: null,
  imageUrl: null,
  productUrl: url,
  details: null,
  moqConflictEvidence: conflict,
};

const unverifiedFaq = {
  kind: "SELLER_FAQ_MOQ_UNVERIFIED" as const,
  productUrl: url,
  faqMinimumOrderQuantity: 1200,
  catalogVerified: false as const,
  verifiedQuote: false as const,
  landedCostEligible: false as const,
};

describe("JAKOV360 #199 informational seller FAQ versus exact catalog MOQ", () => {
  it("preserves both separate sources through the actual external provider preview", async () => {
    const requests: string[] = [];
    const fetcher = vi.fn(async (endpoint: unknown) => {
      requests.push(String(endpoint));
      return new Response(JSON.stringify({ preview: exactProviderPreview }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    });
    const provider = createDetailedSupplierOfferUrlImportProvider({
      endpoint: "https://test-provider.invalid/preview",
      fetcher: fetcher as typeof fetch,
      requestedQuantity: 300,
    });
    const preview = await provider.previewSupplierOfferUrl(url);
    expect(requests).toEqual(["https://test-provider.invalid/preview"]);
    expect(preview.moqConflictEvidence).toEqual(conflict);
    expect(preview.minimumOrderQuantity).toBeNull();
    expect(preview.price).toBeNull();
    expect(preview.details).toBeNull();

    const summary = buildTajaPreviewBusinessSummary(preview, {
      requestedQuantity: 300,
    });
    expect(summary.priceBasisStatus).toBe(TajaPreviewPriceBasisStatuses.MISSING);
    expect(summary.moqStatus).toBe(TajaPreviewMoqStatuses.UNKNOWN);
    expect(summary.landedCostStatus).toBe(TajaPreviewLandedCostStatuses.MISSING_PRICE);
  });

  it("rejects a public conflict with an auto-applied MOQ, price or mismatched SKU", () => {
    const base = {
      title: exactProviderPreview.productTitle,
      supplierName: exactProviderPreview.supplierName,
      supplierCountry: null,
      price: null,
      currency: "USD",
      minimumOrderQuantity: null,
      incoterm: null,
      imageUrl: null,
      productUrl: url,
      source: "pilotoptics.en.made-in-china.com",
      details: null,
      moqConflictEvidence: conflict,
      isPartial: true,
      titleFromSlug: false,
    };
    expect(supplierOfferUrlPreviewSchema.safeParse(base).success).toBe(true);
    expect(supplierOfferUrlPreviewSchema.safeParse({ ...base, price: 0.5 }).success).toBe(false);
    expect(supplierOfferUrlPreviewSchema.safeParse({ ...base, minimumOrderQuantity: 300 }).success).toBe(false);
    expect(supplierOfferUrlPreviewSchema.safeParse({
      ...base,
      moqConflictEvidence: { ...conflict, productUrl: conflict.productUrl.replace("WZBfuPSTaRAU", "WJfUCnDTuekA") },
    }).success).toBe(false);
    expect(supplierOfferUrlPreviewSchema.safeParse({
      ...base,
      moqConflictEvidence: { ...conflict, sourceUrl: catalog.replace("pilotoptics", "bad-seller") },
    }).success).toBe(false);
    expect(supplierOfferUrlPreviewSchema.safeParse({
      ...base,
      moqConflictEvidence: { ...conflict, catalogMinimumOrderQuantity: 1200 },
    }).success).toBe(false);
    expect(supplierOfferUrlPreviewSchema.safeParse({
      ...base,
      moqConflictEvidence: { ...conflict, verifiedQuote: true },
    }).success).toBe(false);
    expect(supplierOfferUrlPreviewSchema.safeParse({
      ...base,
      moqConflictEvidence: { ...conflict, landedCostEligible: true },
    }).success).toBe(false);
  });

  it("includes the same source-disclosure UI in both URL import flows", () => {
    const root = join(import.meta.dirname, "../..");
    const component = readFileSync(join(root, "components/search/supplier-moq-conflict-evidence.tsx"), "utf8");
    const review = readFileSync(join(root, "components/search/url-import-review.tsx"), "utf8");
    const create = readFileSync(join(root, "components/projects/create-project-from-url-form.tsx"), "utf8");
    for (const value of [review, create]) {
      expect(value).toContain("<SupplierMoqConflictEvidence preview={preview} />");
    }
    expect(component).toContain("catalogMinimumOrderQuantity");
    expect(component).toContain("faqMinimumOrderQuantity");
    expect(component).toContain("Nijedan MOQ ni cena nisu automatski uneti");
    expect(component).toContain("landed-cost");
  });
  it("preserves unavailable catalog FAQ observation without pricing or landed cost", async () => {
    const provider = createDetailedSupplierOfferUrlImportProvider({
      endpoint: "https://test-provider.invalid/preview",
      requestedQuantity: 300,
      fetcher: vi.fn(async () => new Response(JSON.stringify({
        preview: {
          ...exactProviderPreview,
          moqConflictEvidence: null,
          moqUnverifiedFaqEvidence: unverifiedFaq,
        },
      }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch,
    });
    const preview = await provider.previewSupplierOfferUrl(url);
    expect(preview.moqUnverifiedFaqEvidence).toEqual(unverifiedFaq);
    expect(preview.moqConflictEvidence).toBeNull();
    expect(preview.price).toBeNull();
    expect(preview.minimumOrderQuantity).toBeNull();
    expect(preview.details).toBeNull();

    const summary = buildTajaPreviewBusinessSummary(preview, { requestedQuantity: 300 });
    expect(summary.priceBasisStatus).toBe(TajaPreviewPriceBasisStatuses.MISSING);
    expect(summary.moqStatus).toBe(TajaPreviewMoqStatuses.UNKNOWN);
    expect(summary.landedCostStatus).toBe(TajaPreviewLandedCostStatuses.MISSING_PRICE);
  });

  it("rejects unsafe upgrades or cross-SKU forgery of unverified FAQ evidence", () => {
    const base = {
      title: exactProviderPreview.productTitle,
      supplierName: exactProviderPreview.supplierName,
      supplierCountry: null,
      price: null,
      currency: "USD",
      minimumOrderQuantity: null,
      incoterm: null,
      imageUrl: null,
      productUrl: url,
      source: "pilotoptics.en.made-in-china.com",
      details: null,
      moqUnverifiedFaqEvidence: unverifiedFaq,
      isPartial: true,
      titleFromSlug: false,
    };
    expect(supplierOfferUrlPreviewSchema.safeParse(base).success).toBe(true);
    expect(supplierOfferUrlPreviewSchema.safeParse({ ...base, price: 0.5 }).success).toBe(false);
    expect(supplierOfferUrlPreviewSchema.safeParse({ ...base, minimumOrderQuantity: 1200 }).success).toBe(false);
    expect(supplierOfferUrlPreviewSchema.safeParse({
      ...base,
      details: { priceTiers: [{ price: 0.5, currency: "USD", minQuantity: 300 }] },
    }).success).toBe(false);
    expect(supplierOfferUrlPreviewSchema.safeParse({
      ...base, moqUnverifiedFaqEvidence: { ...unverifiedFaq, productUrl: url.replace("WZBfuPSTaRAU", "WJfUCnDTuekA") },
    }).success).toBe(false);
    expect(supplierOfferUrlPreviewSchema.safeParse({
      ...base, moqUnverifiedFaqEvidence: { ...unverifiedFaq, verifiedQuote: true },
    }).success).toBe(false);
    expect(supplierOfferUrlPreviewSchema.safeParse({
      ...base, moqUnverifiedFaqEvidence: { ...unverifiedFaq, landedCostEligible: true },
    }).success).toBe(false);
    expect(supplierOfferUrlPreviewSchema.safeParse({
      ...base, moqUnverifiedFaqEvidence: { ...unverifiedFaq, catalogVerified: true },
    }).success).toBe(false);
    expect(supplierOfferUrlPreviewSchema.safeParse({
      ...base, moqConflictEvidence: conflict,
    }).success).toBe(false);
  });

  it("hard-clamps accidental price and MOQ edits in a conflicting source preview", () => {
    const preview = supplierOfferUrlPreviewSchema.parse({
      title: exactProviderPreview.productTitle,
      supplierName: exactProviderPreview.supplierName,
      supplierCountry: null,
      price: null,
      currency: "USD",
      minimumOrderQuantity: null,
      incoterm: null,
      imageUrl: null,
      productUrl: url,
      source: "pilotoptics.en.made-in-china.com",
      details: null,
      moqConflictEvidence: conflict,
      isPartial: true,
      titleFromSlug: false,
    });
    expect(requiresSupplierMoqConfirmation(preview)).toBe(true);
    // Simulate a stale local form state with manually entered commercial data.
    expect(safeCommercialFieldsForPreview({
      ...preview, price: 0.5, minimumOrderQuantity: 1200,
    })).toEqual({
      price: null,
      minimumOrderQuantity: null,
      marketplaceDetails: null,
      supplierLogistics: null,
    });
    expect(safeCommercialFieldsForPreview({
      ...preview,
      moqConflictEvidence: null,
      moqUnverifiedFaqEvidence: unverifiedFaq,
      price: 0.5, minimumOrderQuantity: 300,
    })).toEqual({
      price: null, minimumOrderQuantity: null,
      marketplaceDetails: null, supplierLogistics: null,
    });
  });

  it("continues importing normal verified fields without public MOQ review", () => {
    const preview = supplierOfferUrlPreviewSchema.parse({
      title: exactProviderPreview.productTitle,
      supplierName: exactProviderPreview.supplierName,
      supplierCountry: null,
      price: 4.25,
      currency: "USD",
      minimumOrderQuantity: 300,
      incoterm: null,
      imageUrl: null,
      productUrl: url,
      source: "pilotoptics.en.made-in-china.com",
      details: null,
      moqConflictEvidence: null,
      moqUnverifiedFaqEvidence: null,
      isPartial: true,
      titleFromSlug: false,
    });
    expect(requiresSupplierMoqConfirmation(preview)).toBe(false);
    expect(safeCommercialFieldsForPreview(preview)).toEqual({
      price: 4.25,
      minimumOrderQuantity: 300,
      marketplaceDetails: null,
      supplierLogistics: null,
    });
  });

  it("locks commercial fields in both URL import forms while keeping unpriced import", () => {
    const root = join(import.meta.dirname, "../..");
    const review = readFileSync(join(root, "components/search/url-import-review.tsx"), "utf8");
    const creation = readFileSync(join(root, "components/projects/create-project-from-url-form.tsx"), "utf8");
    for (const source of [review, creation]) {
      expect(source).toContain("safeCommercialFieldsForPreview(preview)");
      expect(source).toContain("disabled={requiresSupplierMoqConfirmation(preview)}");
      expect(source).toContain("price: commercial.price");
      expect(source).toContain("minimumOrderQuantity: commercial.minimumOrderQuantity");
      expect(source).toContain("marketplaceDetails: commercial.marketplaceDetails");
      expect(source).toContain("supplierLogistics: commercial.supplierLogistics");
    }
    const evidence = readFileSync(join(root, "components/search/supplier-moq-conflict-evidence.tsx"), "utf8");
    expect(evidence).toContain("Polja za cenu i MOQ su zaključana");
    expect(evidence).toContain("Preis und Mindestmenge bleiben");
    expect(evidence).toContain("Price and MOQ fields remain locked");
  });

  it("labels unavailable catalog and zero automatic price on all three locales", () => {
    const root = join(import.meta.dirname, "../..");
    const ui = readFileSync(join(root, "components/search/supplier-moq-conflict-evidence.tsx"), "utf8");
    expect(ui).toContain("moqUnverifiedFaqEvidence");
    expect(ui).toContain("MOQ iz FAQ-a — nije potvrđen");
    expect(ui).toContain("MOQ aus Lieferanten-FAQ");
    expect(ui).toContain("Supplier FAQ MOQ — not verified");
    expect(ui).toContain("Cena i MOQ nisu uneti u ponudu ni u obračun uvoza.");
    expect(ui).toContain("{conflict && (");
  });

});
