import { describe, expect, it } from "vitest";

import {
  assertJakov360AcceptanceSeedAllowed,
  buildJakov360AcceptanceSeedPlan,
  JAKOV360_ACCEPTANCE_PROJECT_NAME,
} from "../../prisma/jakov360-acceptance-fixture";
import { canShowBestChoice, classifyOffer, findMatchingQuantityTier } from "../../modules/product-search/domain/offer-classification";
import { supplierOfferSearchResultsSchema } from "../../modules/product-search/domain/search";

describe("JAKOV360 acceptance seed guard", () => {
  it("requires explicit confirmation and refuses production or remote databases", () => {
    const local = "postgresql://tradepilot:tradepilot@localhost:5432/tradepilot?schema=public";

    expect(() => assertJakov360AcceptanceSeedAllowed({ nodeEnv: "development", databaseUrl: local }))
      .toThrow("JAKOV360_ACCEPTANCE_SEED=1");
    expect(() => assertJakov360AcceptanceSeedAllowed({
      nodeEnv: "production",
      databaseUrl: local,
      explicitConfirmation: "1",
    })).toThrow("requires NODE_ENV=development or test");
    expect(() => assertJakov360AcceptanceSeedAllowed({
      nodeEnv: "staging",
      databaseUrl: local,
      explicitConfirmation: "1",
    })).toThrow("requires NODE_ENV=development or test");
    expect(() => assertJakov360AcceptanceSeedAllowed({
      nodeEnv: "development",
      databaseUrl: "postgresql://user:secret@db.example.com:5432/tradepilot",
      explicitConfirmation: "1",
    })).toThrow("Refusing non-local database host");
    expect(() => assertJakov360AcceptanceSeedAllowed({
      nodeEnv: "test",
      databaseUrl: "postgresql://user:secret@127.0.0.1:5432/importpilot-production",
      explicitConfirmation: "1",
    })).toThrow("Refusing production-like database name");
    expect(assertJakov360AcceptanceSeedAllowed({
      nodeEnv: "development",
      databaseUrl: local,
      explicitConfirmation: "1",
    })).toEqual({ databaseHost: "localhost", databaseName: "tradepilot" });
  });
});

describe("JAKOV360 acceptance seed plan", () => {
  it("is deterministic and uses stable unique identifiers", () => {
    const first = buildJakov360AcceptanceSeedPlan();
    const second = buildJakov360AcceptanceSeedPlan();

    expect(second).toEqual(first);
    expect(first.project.name).toBe(JAKOV360_ACCEPTANCE_PROJECT_NAME);
    expect(new Set(first.offers.map((offer) => offer.id)).size).toBe(first.offers.length);
    expect(new Set(first.searchCaches.map((cache) => `${cache.query}:${cache.quantity}:${cache.targetCountry}`)).size)
      .toBe(first.searchCaches.length);
  });

  it("contains all visual acceptance examples without treating Dudi retail price as confirmed B2B", () => {
    const plan = buildJakov360AcceptanceSeedPlan();
    const mainResults = plan.searchCaches[0].results;
    expect(supplierOfferSearchResultsSchema.parse(mainResults)).toHaveLength(4);

    const glasses = mainResults.find((result) => result.title.includes("naočare"));
    const dudi = mainResults.find((result) => result.supplierName === "Dudi Co.");
    const unknown = mainResults.find((result) => result.offerType === "UNKNOWN");
    expect(glasses?.quantityTiers).toHaveLength(4);
    expect(findMatchingQuantityTier(glasses?.quantityTiers, 1000)).toMatchObject({
      minQuantity: 500,
      maxQuantity: 1199,
    });
    expect(glasses?.imageUrl).toContain("jakov360-acceptance-glasses.svg");
    expect(unknown?.imageUrl).toBeNull();

    expect(dudi).toMatchObject({
      price: 1099,
      currency: "RSD",
      minimumOrderQuantity: 100,
      netPrice: 916,
      priceIncludesVat: true,
      availabilityConfirmed: false,
      b2bPriceConfirmed: false,
    });
    const dudiClassification = classifyOffer({
      source: dudi?.source,
      targetCountry: "RS",
      sellerCountry: dudi?.sellerCountry,
      originCountry: dudi?.originCountry,
      importerName: dudi?.importerName,
      currency: dudi?.currency,
      priceIncludesVat: dudi?.priceIncludesVat,
      availabilityConfirmed: dudi?.availabilityConfirmed,
      b2bPriceConfirmed: dudi?.b2bPriceConfirmed,
    });
    expect(dudiClassification.kind).toBe("DOMESTIC");
    expect(canShowBestChoice({
      classification: dudiClassification,
      hasComparablePrice: true,
      hasConfirmedAvailability: false,
    })).toBe(false);
    expect(plan.glassesOfferId).not.toBe(plan.offers.find((offer) => offer.supplierName === "Dudi Co.")?.id);
  });

  it("keeps customs and transport explicitly unconfirmed and includes both RFQ modes", () => {
    const plan = buildJakov360AcceptanceSeedPlan();
    const glasses = plan.offers.find((offer) => offer.id === plan.glassesOfferId);
    const provenance = glasses?.sourceMetadata.customsProvenance as Record<string, unknown>;

    expect(Number(plan.glassesCalculation.shippingCost)).toBe(0);
    expect(provenance.officialUrl).toContain("carina.rs");
    expect(provenance.confirmedByOfficialSource).toBe(false);
    expect(provenance.rateType).toBe("unknown");
    expect(plan.rfqExamples.sample).toContain("request a sample");
    expect(plan.rfqExamples.fullOrder).toContain("final quotation for 1000 units");
  });
});
