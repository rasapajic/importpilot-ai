import { OfferExtractionStatus, OrganizationRole } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

describeWithDatabase("supplier offer permissions and tenant isolation", () => {
  let prisma: typeof import("@/lib/database/prisma").prisma;
  let service: typeof import("@/modules/offers/application/offer-service");
  let organizationId: string;
  let otherOrganizationId: string;
  let projectId: string;
  let userId: string;
  let offerId: string;

  const manualOffer = {
    supplierName: "Manual Supplier",
    supplierCountry: "CN",
    contactEmail: "sales@example.test",
    contactPhone: null,
    moq: 100,
    unitPrice: 5.5,
    currency: "USD",
    incoterm: "FOB",
    deliveryTimeDays: 20,
    paymentTerms: null,
    warranty: null,
    supplierVerified: null,
    yearsOnPlatform: null,
    responseRatePercent: null,
    transactionCount: null,
    employeeCount: null,
    profileCompletenessScore: null,
    sampleAvailable: null,
    termsClarityScore: null,
    shippingClarityScore: null,
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = testDatabaseUrl;
    ({ prisma } = await import("@/lib/database/prisma"));
    service = await import("@/modules/offers/application/offer-service");

    const user = await prisma.user.create({
      data: { email: `offers-${crypto.randomUUID()}@example.test`, name: "Offer Owner" },
    });
    const organization = await prisma.organization.create({
      data: {
        name: "Offer Test Org",
        members: { create: { userId: user.id, role: OrganizationRole.OWNER } },
      },
    });
    const other = await prisma.organization.create({ data: { name: "Other Offer Tenant" } });
    const project = await prisma.importProject.create({
      data: {
        organizationId: organization.id,
        createdById: user.id,
        name: "Offer Project",
        targetCountry: "DE",
        quantity: 100,
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

  it("creates and updates a manual offer inside the active tenant", async () => {
    const offer = await service.createManualOffer(projectId, organizationId, manualOffer);
    offerId = offer.id;
    expect(offer.extractionStatus).toBe(OfferExtractionStatus.MANUAL);

    const updated = await service.updateManualOffer(offer.id, organizationId, {
      ...manualOffer,
      supplierName: "Corrected Supplier",
    });
    expect(updated.supplierName).toBe("Corrected Supplier");
  });

  it("denies create, update and delete across tenants", async () => {
    await expect(
      service.createManualOffer(projectId, otherOrganizationId, manualOffer),
    ).rejects.toBeInstanceOf(service.OfferProjectNotFoundError);
    await expect(
      service.updateManualOffer(offerId, otherOrganizationId, manualOffer),
    ).rejects.toBeInstanceOf(service.OfferNotFoundError);
    await expect(
      service.deleteManualOffer(offerId, otherOrganizationId),
    ).rejects.toBeInstanceOf(service.OfferNotFoundError);
  });

  it("marks corrected extracted offers as reviewed", async () => {
    await prisma.supplierOffer.update({
      where: { id: offerId },
      data: { extractionStatus: OfferExtractionStatus.EXTRACTED },
    });
    const reviewed = await service.updateManualOffer(offerId, organizationId, manualOffer);
    expect(reviewed.extractionStatus).toBe(OfferExtractionStatus.REVIEWED);
    await expect(
      service.deleteManualOffer(offerId, organizationId),
    ).rejects.toBeInstanceOf(service.OfferNotFoundError);
  });
});
