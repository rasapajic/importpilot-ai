import { OrganizationRole } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

describeWithDatabase("project decision history and tenant isolation", () => {
  let prisma: typeof import("@/lib/database/prisma").prisma;
  let service: typeof import("@/modules/decisions/application/project-decision-service");
  let userId: string;
  let organizationId: string;
  let otherOrganizationId: string;
  let projectId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = testDatabaseUrl;
    ({ prisma } = await import("@/lib/database/prisma"));
    service = await import("@/modules/decisions/application/project-decision-service");
    const user = await prisma.user.create({
      data: { email: `decision-${crypto.randomUUID()}@example.test`, name: "Decision Owner" },
    });
    const organization = await prisma.organization.create({
      data: { name: "Decision Org", members: { create: { userId: user.id, role: OrganizationRole.OWNER } } },
    });
    const other = await prisma.organization.create({ data: { name: "Other Decision Org" } });
    const project = await prisma.importProject.create({
      data: { organizationId: organization.id, createdById: user.id, name: "Decision Project", targetCountry: "DE", quantity: 100, targetMargin: 20 },
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

  it("creates a new project decision history record every time", async () => {
    const first = await service.generateProjectDecision(projectId, organizationId);
    const second = await service.generateProjectDecision(projectId, organizationId);
    expect(second.id).not.toBe(first.id);
    expect(await prisma.projectDecision.count({ where: { projectId } })).toBe(2);
  });

  it("prevents another tenant from generating or reading the decision", async () => {
    await expect(
      service.generateProjectDecision(projectId, otherOrganizationId),
    ).rejects.toBeInstanceOf(service.DecisionProjectNotFoundError);
    await expect(service.getLatestProjectDecision(projectId, otherOrganizationId)).resolves.toBeNull();
  });
});

