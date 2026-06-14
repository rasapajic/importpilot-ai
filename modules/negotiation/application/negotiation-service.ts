import {
  NegotiationMessageStatus,
  ProjectActivityType,
  ProjectDecisionStatus,
  type Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/database/prisma";
import type {
  ActionItem,
  ProjectDecisionResult,
} from "@/modules/decisions/domain/project-decision";
import {
  deriveNegotiationRequests,
  generateNegotiationMessage,
  type NegotiationFacts,
  type NegotiationToneValue,
} from "@/modules/negotiation/domain/message-generator";
import { recordProjectActivity } from "@/modules/timeline/application/timeline-service";

export class NegotiationDecisionNotFoundError extends Error {}
export class NegotiationMessageNotFoundError extends Error {}

function jsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function createNegotiationMessage(
  projectId: string,
  organizationId: string,
  tone: NegotiationToneValue,
) {
  const decision = await prisma.projectDecision.findFirst({
    where: {
      projectId,
      organizationId,
      selectedOfferId: { not: null },
      status: ProjectDecisionStatus.NEGOTIATE_FIRST,
    },
    orderBy: { createdAt: "desc" },
    include: {
      project: true,
      selectedOffer: true,
    },
  });
  if (!decision?.selectedOffer) throw new NegotiationDecisionNotFoundError();
  const selectedOffer = decision.selectedOffer;

  const summary =
    decision.summarySnapshot as ProjectDecisionResult["summarySnapshot"];
  const checklist = decision.actionChecklist as ActionItem[];
  const selectedSnapshot = summary.bestOverallOffer;
  const facts: NegotiationFacts = {
    supplierName: selectedOffer.supplierName,
    projectName: decision.project.name,
    projectQuantity: decision.project.quantity,
    projectDecisionStatus: decision.status,
    recommendationStatus:
      selectedSnapshot?.assessment?.recommendationStatus ?? null,
    currency: selectedSnapshot?.currency ?? decision.selectedOffer.currency,
    unitPrice: decision.selectedOffer.unitPrice?.toNumber() ?? null,
    moq: decision.selectedOffer.moq,
    incoterm: selectedSnapshot?.incoterm ?? decision.selectedOffer.incoterm,
    landedCostPerUnit: selectedSnapshot?.landedCostPerUnit ?? null,
    supplierRiskScore:
      selectedSnapshot?.assessment?.supplierRiskScore ?? null,
    overallScore: selectedSnapshot?.assessment?.overallScore ?? null,
  };
  const requestTypes = deriveNegotiationRequests(
    checklist.map((item) => item.key),
    decision.status,
  );
  const draft = generateNegotiationMessage(tone, facts, requestTypes);

  return prisma.$transaction(async (transaction) => {
    const message = await transaction.negotiationMessage.create({
      data: {
      organizationId,
      projectId,
      offerId: selectedOffer.id,
      projectDecisionId: decision.id,
      tone,
      requestTypes,
      lockedFacts: jsonValue(draft.lockedFacts),
      subject: draft.subject,
      body: draft.body,
      },
    });
    await recordProjectActivity(transaction, {
      organizationId,
      projectId,
      type: ProjectActivityType.NEGOTIATION_MESSAGE_GENERATED,
      title: "Pregovaračka poruka je generisana",
      description: selectedOffer.supplierName,
      metadata: { messageId: message.id, tone: message.tone },
    });
    return message;
  });
}

export function listNegotiationMessages(projectId: string, organizationId: string) {
  return prisma.negotiationMessage.findMany({
    where: { projectId, organizationId },
    orderBy: { createdAt: "desc" },
    include: { offer: { select: { supplierName: true } } },
  });
}

export async function markNegotiationMessageSent(
  messageId: string,
  organizationId: string,
) {
  const message = await prisma.negotiationMessage.findFirst({
    where: { id: messageId, organizationId },
    include: { offer: { select: { supplierName: true } } },
  });
  if (!message) throw new NegotiationMessageNotFoundError();
  if (message.status === NegotiationMessageStatus.SENT) return;
  await prisma.$transaction(async (transaction) => {
    await transaction.negotiationMessage.update({
      where: { id: message.id },
      data: { status: NegotiationMessageStatus.SENT, sentAt: new Date() },
    });
    await recordProjectActivity(transaction, {
      organizationId,
      projectId: message.projectId,
      type: ProjectActivityType.NEGOTIATION_MESSAGE_SENT,
      title: "Pregovaračka poruka je označena kao poslata",
      description: message.offer.supplierName,
      metadata: { messageId: message.id },
    });
  });
}
