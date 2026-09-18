import { OrganizationRole, ProjectActivityType, RecommendationStatus } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

describeWithDatabase("search project deletion", () => {
  let prisma: typeof import("@/lib/database/prisma").prisma;
  let service: typeof import("@/modules/projects/application/project-service");
  let organizationId: string;
  let otherOrganizationId: string;
  let userId: string;
  let projectId: string;
  const deletedStorageKeys: string[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = testDatabaseUrl;
    ({ prisma } = await import("@/lib/database/prisma"));
    service = await import("@/modules/projects/application/project-service");

    const user = await prisma.user.create({
      data: { email: `search-delete-${crypto.randomUUID()}@example.test`, name: "Search Owner" },
    });
    const organization = await prisma.organization.create({
      data: {
        name: "Search Delete Org",
        members: { create: { userId: user.id, role: OrganizationRole.OWNER } },
      },
    });
    const other = await prisma.organization.create({ data: { name: "Other Search Delete Org" } });
    const project = await prisma.importProject.create({
      data: {
        organizationId: organization.id,
        createdById: user.id,
        name: "Real search to delete",
        targetCountry: "RS",
        quantity: 100,
        targetMargin: 20,
        offers: { create: { organizationId: organization.id, supplierName: "Supplier" } },
        activities: {
          create: {
            organizationId: organization.id,
            type: ProjectActivityType.PROJECT_CREATED,
            title: "Created",
          },
        },
        files: {
          create: {
            organizationId: organization.id,
            originalFilename: "search.pdf",
            mimeType: "application/pdf",
            size: 10,
            checksum: "e".repeat(64),
            storageKey: `organizations/${organization.id}/search.pdf`,
          },
        },
      },
    });
    const offer = await prisma.supplierOffer.findFirstOrThrow({ where: { projectId: project.id } });
    await prisma.offerAssessment.create({
      data: {
        organizationId: organization.id,
        projectId: project.id,
        offerId: offer.id,
        supplierRiskScore: 20,
        offerQualityScore: 80,
        overallScore: 80,
        confidenceScore: 90,
        recommendationStatus: RecommendationStatus.RECOMMENDED,
        explanation: "Assessment",
        scoreBreakdown: {},
        assessmentVersion: "search-delete-test",
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

  it("blocks cross-tenant deletion", async () => {
    await expect(
      service.deleteSearchProject(projectId, otherOrganizationId, async () => undefined),
    ).rejects.toBeInstanceOf(service.SearchProjectNotFoundError);
  });

  it("deletes storage objects and all project-owned data", async () => {
    await service.deleteSearchProject(projectId, organizationId, async (key) => {
      deletedStorageKeys.push(key);
    });

    expect(deletedStorageKeys).toEqual([`organizations/${organizationId}/search.pdf`]);
    expect(await prisma.importProject.findUnique({ where: { id: projectId } })).toBeNull();
    expect(await prisma.supplierOffer.count({ where: { projectId } })).toBe(0);
    expect(await prisma.offerAssessment.count({ where: { projectId } })).toBe(0);
    expect(await prisma.projectActivity.count({ where: { projectId } })).toBe(0);
    expect(await prisma.uploadedFile.count({ where: { projectId } })).toBe(0);
  });
});
