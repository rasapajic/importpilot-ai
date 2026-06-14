import { OrganizationRole, ProjectActivityType, RecommendationStatus } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

describeWithDatabase("demo project deletion", () => {
  let prisma: typeof import("@/lib/database/prisma").prisma;
  let service: typeof import("@/modules/projects/application/project-service");
  let organizationId: string;
  let otherOrganizationId: string;
  let userId: string;
  let demoProjectId: string;
  let productionProjectId: string;
  const deletedStorageKeys: string[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = testDatabaseUrl;
    ({ prisma } = await import("@/lib/database/prisma"));
    service = await import("@/modules/projects/application/project-service");
    const user = await prisma.user.create({
      data: { email: `demo-delete-${crypto.randomUUID()}@example.test`, name: "Demo Owner" },
    });
    const organization = await prisma.organization.create({
      data: {
        name: "Demo Delete Org",
        members: { create: { userId: user.id, role: OrganizationRole.OWNER } },
      },
    });
    const other = await prisma.organization.create({ data: { name: "Other Demo Delete Org" } });
    const demo = await prisma.importProject.create({
      data: {
        organizationId: organization.id,
        createdById: user.id,
        name: "[DEMO] Delete me",
        targetCountry: "DE",
        quantity: 100,
        targetMargin: 20,
        offers: { create: { organizationId: organization.id, supplierName: "Demo Supplier" } },
        activities: {
          create: {
            organizationId: organization.id,
            type: ProjectActivityType.PROJECT_CREATED,
            title: "Demo activity",
          },
        },
        files: {
          create: {
            organizationId: organization.id,
            originalFilename: "demo.pdf",
            mimeType: "application/pdf",
            size: 10,
            checksum: "d".repeat(64),
            storageKey: `organizations/${organization.id}/demo.pdf`,
          },
        },
      },
    });
    const production = await prisma.importProject.create({
      data: {
        organizationId: organization.id,
        createdById: user.id,
        name: "Production project",
        targetCountry: "DE",
        quantity: 100,
        targetMargin: 20,
      },
    });
    const demoOffer = await prisma.supplierOffer.findFirstOrThrow({ where: { projectId: demo.id } });
    await prisma.offerAssessment.create({
      data: {
        organizationId: organization.id,
        projectId: demo.id,
        offerId: demoOffer.id,
        supplierRiskScore: 20,
        offerQualityScore: 80,
        overallScore: 80,
        confidenceScore: 90,
        recommendationStatus: RecommendationStatus.RECOMMENDED,
        explanation: "Demo assessment",
        scoreBreakdown: {},
        assessmentVersion: "demo-delete-test",
      },
    });
    userId = user.id;
    organizationId = organization.id;
    otherOrganizationId = other.id;
    demoProjectId = demo.id;
    productionProjectId = production.id;
  });

  afterAll(async () => {
    if (!prisma || !userId) return;
    await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.organization.delete({ where: { id: otherOrganizationId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("blocks production and cross-tenant project deletion", async () => {
    await expect(
      service.deleteDemoProject(productionProjectId, organizationId, async () => undefined),
    ).rejects.toBeInstanceOf(service.ProductionProjectDeletionNotAllowedError);
    await expect(
      service.deleteDemoProject(demoProjectId, otherOrganizationId, async () => undefined),
    ).rejects.toBeInstanceOf(service.DemoProjectNotFoundError);
  });

  it("deletes demo documents, offers, history and the project", async () => {
    await service.deleteDemoProject(demoProjectId, organizationId, async (key) => {
      deletedStorageKeys.push(key);
    });
    expect(deletedStorageKeys).toEqual([`organizations/${organizationId}/demo.pdf`]);
    expect(await prisma.importProject.findUnique({ where: { id: demoProjectId } })).toBeNull();
    expect(await prisma.supplierOffer.count({ where: { projectId: demoProjectId } })).toBe(0);
    expect(await prisma.offerAssessment.count({ where: { projectId: demoProjectId } })).toBe(0);
    expect(await prisma.projectActivity.count({ where: { projectId: demoProjectId } })).toBe(0);
    expect(await prisma.uploadedFile.count({ where: { projectId: demoProjectId } })).toBe(0);
  });
});
