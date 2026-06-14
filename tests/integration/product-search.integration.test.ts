import { OrganizationRole, SupplierOfferSource } from "@prisma/client";
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
    await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.organization.delete({ where: { id: otherOrganizationId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("imports a result as a SEARCH_RESULT offer with source metadata", async () => {
    const offer = await service.importSearchResult(projectId, organizationId, result);
    expect(offer.source).toBe(SupplierOfferSource.SEARCH_RESULT);
    expect(offer.supplierName).toBe("Search Supplier");
    expect(offer.sourceMetadata).toMatchObject({
      title: result.title,
      productUrl: result.productUrl,
      providerSource: result.source,
    });
  });

  it("stores manual corrections made before URL import", async () => {
    const corrected = await service.importSearchResult(projectId, organizationId, {
      ...result,
      supplierName: "Corrected Supplier Name",
      minimumOrderQuantity: 250,
    });
    expect(corrected.supplierName).toBe("Corrected Supplier Name");
    expect(corrected.moq).toBe(250);
    expect(corrected.sourceMetadata).toMatchObject({ productUrl: result.productUrl });
  });

  it("passes validated manual comparison values to the provider", async () => {
    let received: unknown;
    await service.searchProjectSupplierOffers(projectId, organizationId, {
      query: "fan",
      quantity: 275,
      targetCountry: "AT",
    }, {
      async searchSupplierOffers(input) {
        received = input;
        return [];
      },
    });
    expect(received).toEqual({ query: "fan", quantity: 275, targetCountry: "AT" });
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
