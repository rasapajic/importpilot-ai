import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { supplierOfferUrlPreviewSchema } from "@/modules/product-search/domain/search";
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
});
