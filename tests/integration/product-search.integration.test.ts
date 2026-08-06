import {
  CalculationStatus,
  OrganizationRole,
  SupplierOfferSource,
} from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

describeWithDatabase("supplier search result import and tenant isolation", () => {
  let prisma: typeof import("@/lib/database/prisma").prisma;
  let service: typeof import("@/modules/product-search/application/product-search-service");
  let organizationId: string;
  let otherOrganizationId: string;
  let projectId: string;
  let userId: string;
  let importedOfferId: string;

  const result = {
    title: "Industrial fan",
    supplierName: "Search Supplier",
    supplierCountry: "CN",
    price: 12.5,
    currency: "USD",
    minimumOrderQuantity: 100,
    incoterm: "FOB",
    productUrl: "https://provider.example/products/industrial-fan",
    imageUrl: null,
    source: "provider-example",
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = testDatabaseUrl;
    ({ prisma } = await import("@/lib/database/prisma"));
    service = await import("@/modules/product-search/application/product-search-service");
    const user = await prisma.user.create({
      data: { email: `search-${crypto.randomUUID()}@example.test`, name: "Search Owner" },
    });
    const organization = await prisma.organization.create({
      data: {
        name: "Search Test Org",
        members: { create: { userId: user.id, role: OrganizationRole.OWNER } },
      },
    });
    const other = await prisma.organization.create({ data: { name: "Other Search Tenant" } });
    const project = await prisma.importProject.create({
      data: {
        organizationId: organization.id,
        createdById: user.id,
        name: "Search Project",
        targetCountry: "DE",
        quantity: 500,
        targetMargin: 20,
      },
    });
    userId = user.id;
    organizationId = organization.id;
    otherOrganizationId = other.id;
    projectId = project.id;
  });

  afterAll(async () => {
    if (!prisma || !userId) return;
    await prisma.supplierSearchCache.deleteMany({
      where: {
        query: "fan",
        targetCountry: "AT",
        quantity: { in: [275, 300] },
      },
    });
    await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.organization.delete({ where: { id: otherOrganizationId } });
    await prisma.user.delete({ where: { id: userId } });
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

  it("passes validated manual comparison values to the provider and returns candidate analysis", async () => {
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

    expect(received).toEqual({ query: "fan", quantity: 275, targetCountry: "AT" });
    expect(outcome.results).toHaveLength(1);
    expect(outcome.candidateAnalyses).toEqual([
      expect.objectContaining({
        productUrl: result.productUrl,
        rank: 1,
        status: "PRELIMINARY",
        finalEligible: false,
        landedCostStatus: "UNAVAILABLE",
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
        deliveryTimeDays: 20,
        sampleAvailable: true,
        termsClarityScore: 90,
        shippingClarityScore: 90,
      },
    });
    await prisma.costCalculation.create({
      data: {
        organizationId,
        projectId,
        offerId: importedOfferId,
        targetCountry: "AT",
        quantity: 275,
        unitPrice: 12.5,
        currency: "USD",
        incoterm: "FOB",
        shippingCost: 300,
        customsDutyRate: 5,
        customsDutyAmount: 190,
        vatRate: 20,
        vatAmount: 798,
        storageCost: 50,
        inspectionCost: 80,
        otherCosts: 30,
        landedCostTotal: 4455,
        landedCostPerUnit: 16.2,
        targetSellingPrice: 28,
        grossMarginPercent: 42.14,
        breakEvenPrice: 16.2,
        calculationStatus: CalculationStatus.CALCULATED,
      },
    });

    const repeatedUrl = `${result.productUrl}?utm_source=repeat&spm=tracking`;
    const outcome = await service.searchProjectSupplierOffers(projectId, organizationId, {
      query: "fan",
      quantity: 275,
      targetCountry: "AT",
    }, {
      async searchSupplierOffers() {
        return [{ ...result, productUrl: repeatedUrl }];
      },
    });

    expect(outcome.candidateAnalyses).toEqual([
      expect.objectContaining({
        productUrl: repeatedUrl,
        status: "FINAL",
        finalEligible: true,
        landedCostStatus: "CONFIRMED",
        supplierRiskLevel: expect.not.stringMatching(/^UNKNOWN$/),
      }),
    ]);
  });

  it("does not reuse a confirmed calculation for a different quantity", async () => {
    const outcome = await service.searchProjectSupplierOffers(projectId, organizationId, {
      query: "fan",
      quantity: 300,
      targetCountry: "AT",
    }, {
      async searchSupplierOffers() {
        return [result];
      },
    });

    expect(outcome.candidateAnalyses).toEqual([
      expect.objectContaining({
        productUrl: result.productUrl,
        status: "PRELIMINARY",
        finalEligible: false,
        landedCostStatus: "UNAVAILABLE",
        missingData: expect.arrayContaining(["LANDED_COST"]),
      }),
    ]);
  });

  it("does not import or search a project from another tenant", async () => {
    await expect(
      service.importSearchResult(projectId, otherOrganizationId, result),
    ).rejects.toBeInstanceOf(service.ProductSearchProjectNotFoundError);
    await expect(
      service.searchProjectSupplierOffers(projectId, otherOrganizationId, {
        query: "fan",
        quantity: 100,
        targetCountry: "DE",
      }),
    ).rejects.toBeInstanceOf(service.ProductSearchProjectNotFoundError);
    await expect(
      service.previewProjectSupplierOfferUrl(projectId, otherOrganizationId, result.productUrl, {
        previewSupplierOfferUrl: async () => ({ ...result, isPartial: false, titleFromSlug: false }),
      }),
    ).rejects.toBeInstanceOf(service.ProductSearchProjectNotFoundError);
  });
});
