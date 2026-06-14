import {
  NegotiationMessageStatus,
  NegotiationTone,
  OrganizationRole,
  ProjectDecisionStatus,
} from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

describeWithDatabase("negotiation message history and tenant isolation", () => {
  let prisma: typeof import("@/lib/database/prisma").prisma;
  let service: typeof import("@/modules/negotiation/application/negotiation-service");
  let userId: string;
  let organizationId: string;
  let otherOrganizationId: string;
  let projectId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = testDatabaseUrl;
    ({ prisma } = await import("@/lib/database/prisma"));
    service = await import("@/modules/negotiation/application/negotiation-service");

    const user = await prisma.user.create({
      data: {
        email: `negotiation-${crypto.randomUUID()}@example.test`,
        name: "Negotiation Owner",
      },
    });
    const organization = await prisma.organization.create({
      data: {
        name: "Negotiation Org",
        members: { create: { userId: user.id, role: OrganizationRole.OWNER } },
      },
    });
    const other = await prisma.organization.create({
      data: { name: "Other Negotiation Org" },
    });
    const project = await prisma.importProject.create({
      data: {
        organizationId: organization.id,
        createdById: user.id,
        name: "Kettle Import",
        targetCountry: "DE",
        quantity: 500,
        targetMargin: 25,
      },
    });
    const offer = await prisma.supplierOffer.create({
      data: {
        organizationId: organization.id,
        projectId: project.id,
        supplierName: "Shenzhen Supply",
        moq: 1000,
        unitPrice: 12.5,
        currency: "EUR",
        incoterm: "FOB",
      },
    });
    await prisma.projectDecision.create({
      data: {
        organizationId: organization.id,
        projectId: project.id,
        selectedOfferId: offer.id,
        status: ProjectDecisionStatus.NEGOTIATE_FIRST,
        decisionReason: "Negotiate shipping and MOQ before purchase.",
        actionChecklist: [
          { key: "CONFIRM_SHIPPING", label: "Confirm shipping" },
          { key: "NEGOTIATE_MOQ", label: "Negotiate MOQ" },
        ],
        summarySnapshot: {
          bestOverallOffer: {
            offerId: offer.id,
            supplierName: offer.supplierName,
            currency: "EUR",
            incoterm: "FOB",
            landedCostPerUnit: 17.25,
            assessment: {
              overallScore: 74,
              supplierRiskScore: 32,
              confidenceScore: 80,
              recommendationStatus: "OK_WITH_RISK",
            },
          },
        },
        decisionVersion: "1.0",
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

  it("creates a new proposed history record for every generation", async () => {
    const first = await service.createNegotiationMessage(
      projectId,
      organizationId,
      NegotiationTone.FORMAL,
    );
    const second = await service.createNegotiationMessage(
      projectId,
      organizationId,
      NegotiationTone.FRIENDLY,
    );

    expect(second.id).not.toBe(first.id);
    expect(await prisma.negotiationMessage.count({ where: { projectId } })).toBe(2);
    expect(first.status).toBe(NegotiationMessageStatus.PROPOSED);
  });

  it("marks sent without changing locked content or facts", async () => {
    const message = await service.createNegotiationMessage(
      projectId,
      organizationId,
      NegotiationTone.DIRECT,
    );
    await service.markNegotiationMessageSent(message.id, organizationId);
    const updated = await prisma.negotiationMessage.findUniqueOrThrow({
      where: { id: message.id },
    });

    expect(updated.status).toBe(NegotiationMessageStatus.SENT);
    expect(updated.sentAt).not.toBeNull();
    expect(updated.subject).toBe(message.subject);
    expect(updated.body).toBe(message.body);
    expect(updated.lockedFacts).toEqual(message.lockedFacts);
    expect(updated.requestTypes).toEqual(message.requestTypes);
  });

  it("prevents another tenant from generating, listing, or marking messages sent", async () => {
    const message = await service.createNegotiationMessage(
      projectId,
      organizationId,
      NegotiationTone.FORMAL,
    );

    await expect(
      service.createNegotiationMessage(
        projectId,
        otherOrganizationId,
        NegotiationTone.FORMAL,
      ),
    ).rejects.toBeInstanceOf(service.NegotiationDecisionNotFoundError);
    await expect(
      service.listNegotiationMessages(projectId, otherOrganizationId),
    ).resolves.toEqual([]);
    await expect(
      service.markNegotiationMessageSent(message.id, otherOrganizationId),
    ).rejects.toBeInstanceOf(service.NegotiationMessageNotFoundError);
  });
});
