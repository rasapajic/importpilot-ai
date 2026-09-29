import { describe, expect, it } from "vitest";

import {
  assertJakov360AcceptanceSeedAllowed,
  buildJakov360AcceptanceSeedPlan,
  JAKOV360_ACCEPTANCE_PROJECT_NAME,
  JAKOV360_ACCEPTANCE_STAGING_DATABASE_NAME,
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

  it("allows only the exact Render acceptance staging database with both safety flags", () => {
    const renderDatabase = `postgresql://user:secret@dpg-example-a.frankfurt-postgres.render.com:5432/${JAKOV360_ACCEPTANCE_STAGING_DATABASE_NAME}`;

    expect(() => assertJakov360AcceptanceSeedAllowed({
      nodeEnv: "production",
      databaseUrl: renderDatabase,
      explicitConfirmation: "1",
    })).toThrow("JAKOV360_ACCEPTANCE_STAGING_SEED=1");
    expect(() => assertJakov360AcceptanceSeedAllowed({
      nodeEnv: "development",
      databaseUrl: renderDatabase,
      explicitConfirmation: "1",
      stagingSafetyConfirmation: "1",
    })).toThrow("requires NODE_ENV=production");
    expect(assertJakov360AcceptanceSeedAllowed({
      nodeEnv: "production",
      databaseUrl: renderDatabase,
      explicitConfirmation: "1",
      stagingSafetyConfirmation: "1",
    })).toEqual({
      databaseHost: "dpg-example-a.frankfurt-postgres.render.com",
      databaseName: JAKOV360_ACCEPTANCE_STAGING_DATABASE_NAME,
    });
    expect(assertJakov360AcceptanceSeedAllowed({
      nodeEnv: "production",
      databaseUrl: `postgresql://user:secret@dpg-example-a:5432/${JAKOV360_ACCEPTANCE_STAGING_DATABASE_NAME}`,
      explicitConfirmation: "1",
      stagingSafetyConfirmation: "1",
    })).toEqual({
      databaseHost: "dpg-example-a",
      databaseName: JAKOV360_ACCEPTANCE_STAGING_DATABASE_NAME,
    });
  });

  it("rejects non-Render, unexpected and production-like remote databases", () => {
    const confirmed = {
      nodeEnv: "production",
      explicitConfirmation: "1",
      stagingSafetyConfirmation: "1",
    } as const;

    expect(() => assertJakov360AcceptanceSeedAllowed({
      ...confirmed,
      databaseUrl: `postgresql://user:secret@db.example.com:5432/${JAKOV360_ACCEPTANCE_STAGING_DATABASE_NAME}`,
    })).toThrow("Refusing non-Render database host");
    expect(() => assertJakov360AcceptanceSeedAllowed({
      ...confirmed,
      databaseUrl: "postgresql://user:secret@dpg-example-a:5432/other_acceptance_staging",
    })).toThrow("Refusing unexpected staging database name");
    expect(() => assertJakov360AcceptanceSeedAllowed({
      ...confirmed,
      databaseUrl: "postgresql://user:secret@dpg-example-a:5432/jakov360_acceptance_staging_prod",
    })).toThrow("Refusing production-like database name");
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
    const allResults = plan.searchCaches.flatMap((cache) => cache.results);
    expect(plan.projects).toHaveLength(2);
    expect(supplierOfferSearchResultsSchema.parse(allResults)).toHaveLength(4);

    const glasses = allResults.find((result) => result.title.includes("naočare"));
    const dudi = allResults.find((result) => result.supplierName === "Dudi Co.");
    const unknown = allResults.find((result) => result.offerType === "UNKNOWN");
    const charger = allResults.find((result) => result.supplierName === "Dongguan Power Export");
    expect(glasses?.quantityTiers).toHaveLength(4);
    expect(findMatchingQuantityTier(glasses?.quantityTiers, 1000)).toMatchObject({
      minQuantity: 500,
      maxQuantity: 1199,
    });
    expect(glasses?.imageUrl).toContain("jakov360-acceptance-glasses.svg");
    expect(unknown?.imageUrl).toContain("missing-image.svg");
    expect(charger?.imageUrl).toContain("jakov360-acceptance-usb-c-charger.svg");
    expect(charger?.imageUrl).not.toContain("glasses");
    expect(glasses?.rfqProductNameEn).toBe("Protective safety glasses — direct import");
    expect(charger?.rfqProductNameEn).toBe("USB-C PD 20W charger — direct import");
    expect(plan.searchCaches.map((cache) => cache.query)).toEqual(["Zaštitne naočare", "USB-C PD 20W punjač"]);

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
    expect(plan.projects[0].offers.some((offer) => offer.supplierName === "Dudi Co.")).toBe(false);
    expect(plan.projects[1].offers.some((offer) => offer.supplierName === "Dudi Co.")).toBe(true);
  });

  it("keeps customs and transport explicitly unconfirmed and includes both RFQ modes", () => {
    const plan = buildJakov360AcceptanceSeedPlan();
    const glasses = plan.offers.find((offer) => offer.id === plan.glassesOfferId);
    const provenance = glasses?.sourceMetadata.customsProvenance as Record<string, unknown>;

    expect(plan.glassesCalculation.shippingCost).toBeNull();
    expect(plan.glassesCalculation.customsDutyRate).toBeNull();
    expect(plan.glassesCalculation.landedCostTotal).toBeNull();
    expect(plan.glassesCalculation.costEvidence.shipping.status).toBe("UNKNOWN");
    expect(provenance.officialUrl).toContain("carina.rs");
    expect(provenance.confirmedByOfficialSource).toBe(false);
    expect(provenance.rateType).toBe("unknown");
    expect(plan.rfqExamples.sample).toContain("request a sample");
    expect(plan.rfqExamples.sample).toContain("Protective safety glasses — direct import");
    expect(plan.rfqExamples.fullOrder).toContain("final quotation for 1000 units");
    expect(plan.rfqExamples.fullOrder).toContain("proposed full HS/tariff code");
  });
});
