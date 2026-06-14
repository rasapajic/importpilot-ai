import { OrganizationRole } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

describeWithDatabase("offer assessment history and tenant isolation", () => {
  let prisma: typeof import("@/lib/database/prisma").prisma;
  let service: typeof import("@/modules/intelligence/application/assessment-service");
  let userId: string;
  let organizationId: string;
  let otherOrganizationId: string;
  let offerId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = testDatabaseUrl;
    ({ prisma } = await import("@/lib/database/prisma"));
    service = await import("@/modules/intelligence/application/assessment-service");
    const user = await prisma.user.create({
      data: { email: `assessment-${crypto.randomUUID()}@example.test`, name: "Assessment Owner" },
    });
    const organization = await prisma.organization.create({
      data: { name: "Assessment Org", members: { create: { userId: user.id, role: OrganizationRole.OWNER } } },
    });
    const other = await prisma.organization.create({ data: { name: "Other Assessment Org" } });
    const project = await prisma.importProject.create({
      data: { organizationId: organization.id, createdById: user.id, name: "Assessment Project", targetCountry: "DE", quantity: 100, targetMargin: 20 },
    });
    const offer = await prisma.supplierOffer.create({
      data: { organizationId: organization.id, projectId: project.id, supplierName: "Assessment Supplier", unitPrice: 10, currency: "EUR", incoterm: "FOB", supplierVerified: true },
    });
    userId = user.id;
    organizationId = organization.id;
    otherOrganizationId = other.id;
    offerId = offer.id;
  });

  afterAll(async () => {
    if (!prisma || !userId) return;
    await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.organization.delete({ where: { id: otherOrganizationId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("creates a new immutable history record on every reassessment", async () => {
    const first = await service.assessSupplierOffer(offerId, organizationId);
    const second = await service.assessSupplierOffer(offerId, organizationId);
    expect(second.id).not.toBe(first.id);
    expect(await prisma.offerAssessment.count({ where: { offerId } })).toBe(2);
  });

  it("does not assess or compare offers across tenants", async () => {
    await expect(service.assessSupplierOffer(offerId, otherOrganizationId)).rejects.toBeInstanceOf(
      service.AssessmentOfferNotFoundError,
    );
    const comparison = await service.compareProjectOffers(
      (await prisma.supplierOffer.findUniqueOrThrow({ where: { id: offerId } })).projectId,
      organizationId,
    );
    expect(comparison.flatMap((group) => group.offers).every((offer) => offer.offerId === offerId)).toBe(true);
  });
});

