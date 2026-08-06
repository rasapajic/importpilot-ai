import { OrganizationRole } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

describeWithDatabase("persisted TAJA supplier logistics", () => {
  let prisma: typeof import("@/lib/database/prisma").prisma;
  let service: typeof import("@/modules/product-search/application/product-search-service");
  let organizationId: string;
  let projectId: string;
  let userId: string;

  const query = "saved 1688 organizer";
  const productUrl = "https://detail.1688.com/offer/987654321.html";
  const storedResult = {
    title: "Foldable car trunk organizer",
    supplierName: "1688 Organizer Factory",
    supplierCountry: "CN",
    price: 18.5,
    currency: "CNY",
    minimumOrderQuantity: 20,
    incoterm: null,
    productUrl,
    imageUrl: null,
    source: "TAJA 1688",
    supplierLogistics: {
      grossWeightKg: null,
      netWeightKg: null,
      cartonLengthCm: null,
      cartonWidthCm: null,
      cartonHeightCm: null,
      piecesPerCarton: null,
      unitWeightKg: 0.7,
      unitVolumeCbm: 0.004,
      evidence: "PRODUCT_PAGE" as const,
    },
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = testDatabaseUrl;
    ({ prisma } = await import("@/lib/database/prisma"));
    service = await import("@/modules/product-search/application/product-search-service");
    const user = await prisma.user.create({
      data: {
        email: `saved-logistics-${crypto.randomUUID()}@example.test`,
        name: "Saved Logistics Owner",
      },
    });
    const organization = await prisma.organization.create({
      data: {
        name: "Saved Logistics Test Org",
        members: { create: { userId: user.id, role: OrganizationRole.OWNER } },
      },
    });
    const project = await prisma.importProject.create({
      data: {
        organizationId: organization.id,
        createdById: user.id,
        name: "Saved 1688 Logistics",
        targetCountry: "AT",
        quantity: 100,
        targetMargin: 30,
      },
    });
    userId = user.id;
    organizationId = organization.id;
    projectId = project.id;
  });

  afterAll(async () => {
    if (!prisma || !userId) return;
    await prisma.supplierSearchCache.deleteMany({
      where: { query, targetCountry: "AT", quantity: 100 },
    });
    await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("reuses saved logistics when a later provider result omits them", async () => {
    const imported = await service.importSearchResult(
      projectId,
      organizationId,
      storedResult,
    );
    expect(imported.sourceMetadata).toMatchObject({
      productUrl,
      supplierLogistics: storedResult.supplierLogistics,
    });

    const repeatedUrl = `${productUrl}?spm=repeat&utm_source=taja`;
    const outcome = await service.searchProjectSupplierOffers(
      projectId,
      organizationId,
      { query, quantity: 100, targetCountry: "AT" },
      {
        async searchSupplierOffers() {
          return [{
            ...storedResult,
            productUrl: repeatedUrl,
            supplierLogistics: undefined,
          }];
        },
      },
    );

    expect(outcome.results[0]).toMatchObject({
      productUrl: repeatedUrl,
      supplierLogistics: storedResult.supplierLogistics,
    });
    expect(outcome.candidateAnalyses[0]).toMatchObject({
      productUrl: repeatedUrl,
      status: "PRELIMINARY",
      finalEligible: false,
      landedCostStatus: "ESTIMATED",
      preliminaryCostEstimate: {
        version: "TAJA_PRELIMINARY_LANDED_COST_V3",
        confidence: "MEDIUM",
        pricingBasisIncoterm: "EXW",
        pricingBasisAssumed: true,
        chinaDomesticTransportEur: 30,
        sourcingAgentFeeEur: 35,
      },
    });
  });
});
