import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SupplierOfferUrlPreview } from "@/modules/product-search/domain/search";
import { supplierOfferSearchResultSchema } from "@/modules/product-search/domain/search";
import { createProjectFromUrlRequestSchema } from "@/modules/projects/domain/url-project-creation";
import {
  safeCommercialFieldsForPreview,
  requiresSupplierMoqConfirmation,
} from "@/modules/product-search/domain/public-moq-review";
import {
  buildTajaPreviewBusinessSummary,
  TajaPreviewLandedCostStatuses,
} from "@/modules/product-search/domain/taja-preview-business-summary";

const db = vi.hoisted(() => ({
  transaction: vi.fn(),
  projectCreate: vi.fn(),
  historyCreate: vi.fn(),
  offerCreate: vi.fn(),
  activityCreate: vi.fn(),
  rfqCreate: vi.fn(),
  negotiationCreate: vi.fn(),
  costCreate: vi.fn(),
}));

// All database calls are fully in-memory mocks. No Render database connection,
// actual RFQ, external request, network call or persisted project is possible.
vi.mock("@/lib/database/prisma", () => ({
  prisma: { $transaction: db.transaction },
}));

import { createProjectFromUrl } from "@/modules/projects/application/create-project-from-url";

const originalUrl =
  "https://pilotoptics.en.made-in-china.com/product/WJfUCnDTuekA/China-Pilot-Optics-Wholesale-High-Quality-5-Colors-Custom-Logo-Square-Reading-Glasses.html";
const secondUrl =
  "https://pilotoptics.en.made-in-china.com/product/WZBfuPSTaRAU/China-Pilot-Optics-2023-Fashion-Classic-Rectangle-Anti-Blue-Light-Blocking-Reading-Glasses.html";
const catalogUrl =
  "https://pilotoptics.en.made-in-china.com/product-group/UejAsgVMrLhv/Reading-glasses-catalog-1.html";

function preview(productUrl: string, review: "aligned" | "conflict" | "faq-only" | "missing" | "priced"): SupplierOfferUrlPreview {
  const result: SupplierOfferUrlPreview = {
    title: "Pilot Optics Reading Glasses",
    supplierName: "Pilot Optics International Corp.Ltd.",
    supplierCountry: null,
    price: review === "priced" ? 1.25 : null,
    // The public preview retains USD even with no confirmed price. It must
    // NOT send USD to the offer API if the numeric offer price is missing.
    currency: "USD",
    minimumOrderQuantity: review === "priced" ? 1200 : null,
    incoterm: null,
    imageUrl: null,
    productUrl,
    source: "pilotoptics.en.made-in-china.com",
    details: null,
    isPartial: true,
    titleFromSlug: false,
  };
  if (review === "aligned") {
    result.moqAlignedFaqEvidence = {
      kind: "SELLER_FAQ_CATALOG_MOQ_ALIGNED_UNCONFIRMED",
      productUrl,
      sourceUrl: catalogUrl,
      faqMinimumOrderQuantity: 1200,
      catalogMinimumOrderQuantity: 1200,
      lowPrice: "0.50",
      highPrice: "2.00",
      currency: "USD",
      unit: "Piece",
      corroborated: false,
      verifiedQuote: false,
      landedCostEligible: false,
    };
  } else if (review === "conflict") {
    result.moqConflictEvidence = {
      kind: "SELLER_CATALOG_FAQ_MOQ_CONFLICT",
      productUrl,
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
    };
  } else if (review === "faq-only") {
    result.moqUnverifiedFaqEvidence = {
      kind: "SELLER_FAQ_MOQ_UNVERIFIED",
      productUrl,
      faqMinimumOrderQuantity: 1200,
      catalogVerified: false,
      verifiedQuote: false,
      landedCostEligible: false,
    };
  }
  return result;
}

function payloadFromPreview(value: SupplierOfferUrlPreview) {
  const commercial = safeCommercialFieldsForPreview(value);
  return {
    project: {
      name: value.title ?? "Optical frames",
      quantity: "1200",
      targetCountry: "de",
      targetMargin: "20",
    },
    offer: {
      title: value.title ?? "Optical frames",
      supplierName: value.supplierName ?? "Supplier not identified",
      supplierCountry: value.supplierCountry,
      price: commercial.price,
      currency: commercial.currency,
      minimumOrderQuantity: commercial.minimumOrderQuantity,
      incoterm: value.incoterm,
      productUrl: value.productUrl,
      imageUrl: value.imageUrl,
      source: value.source,
      marketplaceDetails: commercial.marketplaceDetails,
      supplierLogistics: commercial.supplierLogistics,
    },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  db.projectCreate.mockResolvedValue({ id: "project-test", name: "Pilot Optics Reading Glasses" });
  db.historyCreate.mockResolvedValue({ id: "history-test" });
  db.offerCreate.mockResolvedValue({ id: "offer-test", supplierName: "Pilot Optics International Corp.Ltd." });
  db.activityCreate.mockResolvedValue({ id: "activity-test" });
  db.transaction.mockImplementation(
    async (callback: (client: {
      importProject: { create: typeof db.projectCreate };
      projectCompletionHistory: { create: typeof db.historyCreate };
      supplierOffer: { create: typeof db.offerCreate };
      projectActivity: { create: typeof db.activityCreate };
      rfq: { create: typeof db.rfqCreate };
      negotiationMessage: { create: typeof db.negotiationCreate };
      costCalculation: { create: typeof db.costCreate };
    }) => Promise<unknown>) => callback({
      importProject: { create: db.projectCreate },
      projectCompletionHistory: { create: db.historyCreate },
      supplierOffer: { create: db.offerCreate },
      projectActivity: { create: db.activityCreate },
      rfq: { create: db.rfqCreate },
      negotiationMessage: { create: db.negotiationCreate },
      costCalculation: { create: db.costCreate },
    }),
  );
});

describe("JAKOV360 #222 unpriced URL project and offer persistence", () => {
  it.each([
    ["original Pilot SKU with matching FAQ and catalog", originalUrl, "aligned"],
    ["second Pilot SKU with conflicting catalog MOQ", secondUrl, "conflict"],
    ["FAQ-only source when catalog is unavailable", secondUrl, "faq-only"],
  ] as const)("%s is accepted by the real request schema with no usable commercial terms",
    (_label, url, review) => {
      const initial = preview(url, review);
      expect(requiresSupplierMoqConfirmation(initial)).toBe(true);
      const payload = payloadFromPreview(initial);
      expect(payload.offer).toMatchObject({
        price: null,
        currency: null,
        minimumOrderQuantity: null,
        marketplaceDetails: null,
        supplierLogistics: null,
      });
      const validated = createProjectFromUrlRequestSchema.parse(payload);
      expect(validated.project).toMatchObject({
        name: initial.title,
        quantity: 1200,
        targetCountry: "DE",
        targetMargin: 20,
      });
      expect(validated.offer.price).toBeNull();
      expect(validated.offer.currency).toBeNull();
      expect(validated.offer.minimumOrderQuantity).toBeNull();
      const taja = buildTajaPreviewBusinessSummary(initial, { requestedQuantity: 1200 });
      expect(taja.landedCostStatus).toBe(TajaPreviewLandedCostStatuses.MISSING_PRICE);
      expect(db.transaction).not.toHaveBeenCalled();
    });

  it.each([
    ["original Pilot SKU matching sources", originalUrl, "aligned"],
    ["second Pilot SKU conflicting sources", secondUrl, "conflict"],
  ] as const)("%s is atomically recorded as an unpriced candidate without an RFQ or landed cost",
    async (_label, url, review) => {
      const input = createProjectFromUrlRequestSchema.parse(
        payloadFromPreview(preview(url, review)),
      );
      const result = await createProjectFromUrl(input, "test-org", "test-user");
      expect(result).toEqual({ projectId: "project-test", offerId: "offer-test" });
      expect(db.transaction).toHaveBeenCalledTimes(1);
      expect(db.projectCreate).toHaveBeenCalledTimes(1);
      expect(db.historyCreate).toHaveBeenCalledTimes(1);
      expect(db.offerCreate).toHaveBeenCalledTimes(1);
      expect(db.activityCreate).toHaveBeenCalledTimes(2);
      const stored = db.offerCreate.mock.calls[0]?.[0]?.data;
      expect(stored).toMatchObject({
        projectId: "project-test",
        organizationId: "test-org",
        supplierName: "Pilot Optics International Corp.Ltd.",
        unitPrice: null,
        moq: null,
        currency: null,
        supplierCountry: null,
        sourceMetadata: expect.objectContaining({
          productUrl: url,
          resultOrigin: "url-import",
          captureMode: "URL_IMPORT",
          dataStatus: "PARTIAL",
          supplierLogistics: null,
          marketplaceDetails: null,
        }),
      });
      // The only writes are project, completion history, one unpriced offer,
      // and the project/offer timeline events. No negotiation/RFQ/cost create.
      expect(db.rfqCreate).not.toHaveBeenCalled();
      expect(db.negotiationCreate).not.toHaveBeenCalled();
      expect(db.costCreate).not.toHaveBeenCalled();
    });

  it("rejects the previous bug: null price plus USD currency before starting any transaction", () => {
    const payload = payloadFromPreview(preview(originalUrl, "aligned"));
    const invalid = {
      ...payload,
      offer: { ...payload.offer, currency: "USD" },
    };
    expect(createProjectFromUrlRequestSchema.safeParse(invalid).success).toBe(false);
    expect(supplierOfferSearchResultSchema.safeParse(invalid.offer).success).toBe(false);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("strips orphan currency from ordinary partial previews and keeps genuine priced offers unchanged", () => {
    const ordinaryPartial = preview(secondUrl, "missing");
    expect(requiresSupplierMoqConfirmation(ordinaryPartial)).toBe(false);
    expect(safeCommercialFieldsForPreview(ordinaryPartial)).toMatchObject({
      price: null, currency: null,
    });
    expect(createProjectFromUrlRequestSchema.safeParse(payloadFromPreview(ordinaryPartial)).success)
      .toBe(true);
    const priced = preview(secondUrl, "priced");
    const value = safeCommercialFieldsForPreview(priced);
    expect(value).toMatchObject({ price: 1.25, currency: "USD", minimumOrderQuantity: 1200 });
    expect(createProjectFromUrlRequestSchema.safeParse(payloadFromPreview(priced)).success)
      .toBe(true);
  });

  it("uses the validated atomic create route and both import forms' paired currency", () => {
    const root = join(import.meta.dirname, "../..");
    const route = readFileSync(join(root, "app/api/projects/from-url/route.ts"), "utf8");
    const service = readFileSync(join(root, "modules/projects/application/create-project-from-url.ts"), "utf8");
    expect(route).toContain("createProjectFromUrlRequestSchema.safeParse");
    expect(route).toContain("createProjectFromUrl(");
    expect(service).toContain("prisma.$transaction");
    expect(service).not.toMatch(/\b(?:sendRf[qQ]|createRf[qQ]|calculateLandedCost)\s*\(/);
    expect(service).not.toContain("costCalculation.create");
    for (const name of [
      "components/projects/create-project-from-url-form.tsx",
      "components/search/url-import-review.tsx",
    ]) {
      const form = readFileSync(join(root, name), "utf8");
      expect(form).toContain("const commercial = safeCommercialFieldsForPreview(preview)");
      expect(form).toContain("price: commercial.price");
      expect(form).toContain("currency: commercial.currency");
      expect(form).toContain("minimumOrderQuantity: commercial.minimumOrderQuantity");
    }
  });
});
