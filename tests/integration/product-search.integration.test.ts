import { CalculationStatus, SupplierOfferSource } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

describeWithDatabase("supplier search result import and tenant isolation", () => {
  let prisma: typeof import("@/lib/database/prisma").prisma;
  let service: typeof import("@/modules/product-search/application/product-search-service");
  let organizationId: string;
  let foreignOrganizationId: string;
  let projectId: string;
  let importedOfferId: string;

  const result = {
    title: "Industrial Fan",
    supplierName: "Search Supplier",
    supplierCountry: "CN",
    price: 18,
    currency: "EUR",
    minimumOrderQuantity: 100,
    incoterm: "FOB",
    productUrl: "https://provider.example/products/industrial-fan",
    imageUrl: "https://provider.example/images/industrial-fan.jpg",
    source: "Search fixture",
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = testDatabaseUrl;
    ({ prisma } = await import("@/lib/database/prisma"));
    service = await import("@/modules/product-search/application/product-search-service");

    const organization = await prisma.organization.create({
      data: { name: `Search Integration ${crypto.randomUUID()}` },
    });
    organizationId = organization.id;
    const foreignOrganization = await prisma.organization.create({
      data: { name: `Search Foreign ${crypto.randomUUID()}` },
    });
    foreignOrganizationId = foreignOrganization.id;
    const project = await prisma.importProject.create({
      data: {
        organizationId,
        name: "Search Integration Project",
        productCategory: "industrial fan",
        targetCountry: "AT",
        targetQuantity: 275,
        targetMargin: 25,
      },
    });
    projectId = project.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    if (projectId) {
      await prisma.importProject.delete({ where: { id: projectId } }).catch(() => undefined);
    }
    if (organizationId) {
      await prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
    }
    if (foreignOrganizationId) {
      await prisma.organization.delete({ where: { id: foreignOrganizationId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it("imports a result as a SEARCH_RESULT offer with source metadata", async () => {
    const offer = await service.importSearchResult(projectId, organizationId, result);
    importedOfferId = offer.id;
    expect(offer.source).toBe(SupplierOfferSource.SEARCH_RESULT);
    expect(offer.supplierName).toBe("Search Supplier");
    expect(offer.sourceMetadata).toMatchObject({
      title: result.title,
      productUrl: result.productUrl,
      providerSource: result.source,
    });
  });

  it("rejects the same supplier page when only tracking parameters changed", async () => {
    await expect(service.importSearchResult(projectId, organizationId, {
      ...result,
      productUrl: `${result.productUrl}?utm_source=repeat&spm=tracking#details`,
    })).rejects.toMatchObject({ existingOfferId: importedOfferId });
  });

  it("stores manual corrections made before URL import", async () => {
    const correctedUrl = "https://provider.example/products/industrial-fan-corrected";
    const corrected = await service.importSearchResult(projectId, organizationId, {
      ...result,
      productUrl: correctedUrl,
      supplierName: "Corrected Supplier Name",
      minimumOrderQuantity: 250,
    });
    expect(corrected.supplierName).toBe("Corrected Supplier Name");
    expect(corrected.moq).toBe(250);
    expect(corrected.sourceMetadata).toMatchObject({ productUrl: correctedUrl });
  });

  it("passes validated manual comparison values and normalized query variants to the provider", async () => {
    let received: unknown;
    const outcome = await service.searchProjectSupplierOffers(projectId, organizationId, {
      query: "fan",
      quantity: 275,
      targetCountry: "AT",
    }, {
      async searchSupplierOffers(input) {
        received = input;
        return [result];
      },
    });

    expect(received).toEqual({
      query: "fan",
      quantity: 275,
      targetCountry: "AT",
      queryVariants: ["fan"],
      chinese1688QueryVariants: [],
    });
    expect(outcome.results).toHaveLength(1);
    expect(outcome.candidateAnalyses).toEqual([
      expect.objectContaining({
        productUrl: result.productUrl,
        rank: 1,
        status: "PRELIMINARY",
        finalEligible: false,
        landedCostStatus: "ESTIMATED",
        preliminaryCostEstimate: expect.objectContaining({
          currency: "EUR",
          lowPerUnitEur: expect.any(Number),
          basePerUnitEur: expect.any(Number),
          highPerUnitEur: expect.any(Number),
        }),
        missingData: expect.arrayContaining([
          "LANDED_COST",
          "SUPPLIER_VERIFICATION",
          "SUPPLIER_RISK_DATA",
        ]),
      }),
    ]);
  });

  it("reuses persisted landed cost and supplier evidence across tracking URL changes", async () => {
    await prisma.supplierOffer.update({
      where: { id: importedOfferId },
      data: {
        supplierVerified: true,
        yearsOnPlatform: 5,
        responseRatePercent: 92,
        transactionCount: 120,
        employeeCount: 80,
        profileCompletenessScore: 90,
        deliveryTimeDays: 18,
        sampleAvailable: true,
        termsClarityScore: 85,
        shippingClarityScore: 80,
      },
    });
    await prisma.costCalculation.create({
      data: {
        offerId: importedOfferId,
        organizationId,
        targetCountry: "AT",
        quantity: 275,
        unitPrice: 18,
        currency: "EUR",
        incoterm: "FOB",
        landedCostTotal: 6050,
        landedCostPerUnit: 22,
        targetSellPrice: 31,
        grossMarginPercent: 29,
        calculationStatus: CalculationStatus.CALCULATED,
      },
    });

    const outcome = await service.searchProjectSupplierOffers(projectId, organizationId, {
      query: "fan",
      quantity: 275,
      targetCountry: "AT",
    }, {
      async searchSupplierOffers() {
        return [{
          ...result,
          productUrl: `${result.productUrl}?utm_source=live&spm=abc#offer`,
        }];
      },
    });

    expect(outcome.candidateAnalyses).toEqual([
      expect.objectContaining({
        supplierVerified: true,
        yearsOnPlatform: 5,
        responseRatePercent: 92,
        landedCostStatus: "CONFIRMED",
        landedCostPerUnit: 22,
        finalEligible: true,
      }),
    ]);
  });

  it("does not reuse a confirmed calculation for a different quantity", async () => {
    const outcome = await service.searchProjectSupplierOffers(projectId, organizationId, {
      query: "fan",
      quantity: 400,
      targetCountry: "AT",
    }, {
      async searchSupplierOffers() {
        return [result];
      },
    });

    expect(outcome.candidateAnalyses).toEqual([
      expect.objectContaining({
        landedCostStatus: "ESTIMATED",
        finalEligible: false,
      }),
    ]);
  });

  it("does not import or search a project from another tenant", async () => {
    await expect(service.importSearchResult(
      projectId,
      foreignOrganizationId,
      result,
    )).rejects.toBeInstanceOf(service.ProductSearchProjectNotFoundError);

    await expect(service.searchProjectSupplierOffers(
      projectId,
      foreignOrganizationId,
      { query: "fan", quantity: 275, targetCountry: "AT" },
      { async searchSupplierOffers() { return [result]; } },
    )).rejects.toBeInstanceOf(service.ProductSearchProjectNotFoundError);
  });
});
