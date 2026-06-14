import { OrganizationRole, ProjectActivityType } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

describeWithDatabase("project timeline history and tenant isolation", () => {
  let prisma: typeof import("@/lib/database/prisma").prisma;
  let projectService: typeof import("@/modules/projects/application/project-service");
  let timelineService: typeof import("@/modules/timeline/application/timeline-service");
  let userId: string;
  let organizationId: string;
  let otherOrganizationId: string;
  let projectId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = testDatabaseUrl;
    ({ prisma } = await import("@/lib/database/prisma"));
    projectService = await import("@/modules/projects/application/project-service");
    timelineService = await import("@/modules/timeline/application/timeline-service");

    const user = await prisma.user.create({
      data: { email: `timeline-${crypto.randomUUID()}@example.test`, name: "Timeline Owner" },
    });
    const organization = await prisma.organization.create({
      data: {
        name: "Timeline Org",
        members: { create: { userId: user.id, role: OrganizationRole.OWNER } },
      },
    });
    const other = await prisma.organization.create({ data: { name: "Other Timeline Org" } });
    const project = await projectService.createProject(
      { name: "Timeline Project", targetCountry: "DE", quantity: 100, targetMargin: 20 },
      organization.id,
      user.id,
    );

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

  it("creates an append-only project-created event with the project", async () => {
    const activities = await timelineService.listProjectActivities(projectId, organizationId);
    expect(activities).toHaveLength(1);
    expect(activities?.[0]).toMatchObject({
      type: ProjectActivityType.PROJECT_CREATED,
      title: "Projekat je kreiran",
    });
  });

  it("filters by event type", async () => {
    const activities = await timelineService.listProjectActivities(
      projectId,
      organizationId,
      ProjectActivityType.PROJECT_CREATED,
    );
    expect(activities?.every((activity) => activity.type === ProjectActivityType.PROJECT_CREATED)).toBe(true);
  });

  it("does not reveal timeline events across tenants", async () => {
    await expect(
      timelineService.listProjectActivities(projectId, otherOrganizationId),
    ).resolves.toBeNull();
  });
});
