import { OrganizationRole, ProjectDecisionStatus } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

describeWithDatabase("feedback analytics history and tenant isolation", () => {
  let prisma: typeof import("@/lib/database/prisma").prisma;
  let service: typeof import("@/modules/feedback/application/feedback-service");
  let userId: string;
  let organizationId: string;
  let otherOrganizationId: string;
  let projectId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = testDatabaseUrl;
    ({ prisma } = await import("@/lib/database/prisma"));
    service = await import("@/modules/feedback/application/feedback-service");
    const user = await prisma.user.create({
      data: { email: `feedback-${crypto.randomUUID()}@example.test`, name: "Feedback Owner" },
    });
    const organization = await prisma.organization.create({
      data: {
        name: "Feedback Org",
        members: { create: { userId: user.id, role: OrganizationRole.OWNER } },
      },
    });
    const other = await prisma.organization.create({ data: { name: "Other Feedback Org" } });
    const project = await prisma.importProject.create({
      data: { organizationId: organization.id, createdById: user.id, name: "Feedback Project", targetCountry: "DE", quantity: 100, targetMargin: 20 },
    });
    await prisma.projectDecision.create({
      data: {
        organizationId: organization.id,
        projectId: project.id,
        status: ProjectDecisionStatus.READY_TO_BUY,
        decisionReason: "Ready",
        actionChecklist: [],
        summarySnapshot: {},
        decisionVersion: "test",
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

  it("keeps outcome, feedback and completion histories append-only", async () => {
    await service.recordProjectOutcome(projectId, organizationId, { outcome: "BOUGHT", purchaseSuccessful: true });
    await service.recordProjectOutcome(projectId, organizationId, { outcome: "NEGOTIATED", comment: "Better price" });
    await service.recordRecommendationFeedback(projectId, organizationId, { vote: "HELPFUL" });
    await service.changeProjectCompletion(projectId, organizationId, { status: "COMPLETED" });

    const evidence = await service.getProjectEvidence(projectId, organizationId);
    expect(evidence?.outcomes).toHaveLength(2);
    expect(evidence?.recommendationFeedback).toHaveLength(1);
    expect(evidence?.completionHistory).toHaveLength(1);
  });

  it("does not expose or write evidence across tenants", async () => {
    await expect(service.getProjectEvidence(projectId, otherOrganizationId)).resolves.toBeNull();
    await expect(
      service.recordProjectOutcome(projectId, otherOrganizationId, { outcome: "BOUGHT" }),
    ).rejects.toBeInstanceOf(service.FeedbackProjectNotFoundError);
  });

  it("aggregates recommendation accuracy from latest tenant outcomes", async () => {
    const analytics = await service.getOrganizationAnalytics(organizationId);
    expect(analytics.accuracy.negotiateFirstImproved).toBe(0);
    expect(analytics.accuracy.recordedOutcomeCount).toBe(1);
  });
});
