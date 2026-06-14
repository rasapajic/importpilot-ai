import {
  ProjectActivityType,
  ProjectCompletionStatus,
  type Prisma,
} from "@prisma/client";
import type { z } from "zod";

import { prisma } from "@/lib/database/prisma";
import type {
  projectCompletionSchema,
  projectOutcomeSchema,
  recommendationFeedbackSchema,
} from "@/modules/feedback/domain/validation";
import { recordProjectActivity } from "@/modules/timeline/application/timeline-service";

type OutcomeInput = z.infer<typeof projectOutcomeSchema>;
type FeedbackInput = z.infer<typeof recommendationFeedbackSchema>;
type CompletionInput = z.infer<typeof projectCompletionSchema>;

export class FeedbackProjectNotFoundError extends Error {}
export class FeedbackDecisionNotFoundError extends Error {}

function jsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function getProjectEvidence(projectId: string, organizationId: string) {
  return prisma.importProject.findFirst({
    where: { id: projectId, organizationId },
    select: {
      completionStatus: true,
      outcomes: { orderBy: { createdAt: "desc" }, take: 10 },
      recommendationFeedback: { orderBy: { createdAt: "desc" }, take: 10 },
      completionHistory: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
}

export async function recordProjectOutcome(
  projectId: string,
  organizationId: string,
  input: OutcomeInput,
) {
  const project = await prisma.importProject.findFirst({
    where: { id: projectId, organizationId },
    include: { projectDecisions: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!project) throw new FeedbackProjectNotFoundError();
  const latestDecision = project.projectDecisions[0];

  return prisma.$transaction(async (transaction) => {
    const outcome = await transaction.projectOutcome.create({
      data: {
        organizationId,
        projectId,
        outcome: input.outcome,
        decisionStatus: latestDecision?.status,
        finalPrice: input.finalPrice,
        finalCurrency: input.finalCurrency,
        purchaseSuccessful: input.purchaseSuccessful,
        comment: input.comment,
      },
    });
    await recordProjectActivity(transaction, {
      organizationId,
      projectId,
      type: ProjectActivityType.PROJECT_OUTCOME_RECORDED,
      title: "Ishod projekta je zabeležen",
      description: input.outcome,
      metadata: jsonValue({ outcomeId: outcome.id, outcome: input.outcome }),
    });
    return outcome;
  });
}

export async function recordRecommendationFeedback(
  projectId: string,
  organizationId: string,
  input: FeedbackInput,
) {
  const decision = await prisma.projectDecision.findFirst({
    where: { projectId, organizationId },
    orderBy: { createdAt: "desc" },
  });
  if (!decision) throw new FeedbackDecisionNotFoundError();

  return prisma.$transaction(async (transaction) => {
    const feedback = await transaction.recommendationFeedback.create({
      data: {
        organizationId,
        projectId,
        projectDecisionId: decision.id,
        vote: input.vote,
        comment: input.comment,
      },
    });
    await recordProjectActivity(transaction, {
      organizationId,
      projectId,
      type: ProjectActivityType.RECOMMENDATION_FEEDBACK_RECORDED,
      title: "Korisnost preporuke je ocenjena",
      description: input.vote,
      metadata: jsonValue({ feedbackId: feedback.id, vote: input.vote }),
    });
    return feedback;
  });
}

export async function changeProjectCompletion(
  projectId: string,
  organizationId: string,
  input: CompletionInput,
) {
  const project = await prisma.importProject.findFirst({
    where: { id: projectId, organizationId },
    select: { id: true, completionStatus: true },
  });
  if (!project) throw new FeedbackProjectNotFoundError();
  if (project.completionStatus === input.status) return project;

  return prisma.$transaction(async (transaction) => {
    const updated = await transaction.importProject.update({
      where: { id: projectId },
      data: { completionStatus: input.status },
    });
    await transaction.projectCompletionHistory.create({
      data: { organizationId, projectId, status: input.status },
    });
    await recordProjectActivity(transaction, {
      organizationId,
      projectId,
      type: ProjectActivityType.PROJECT_COMPLETION_CHANGED,
      title: "Status završetka projekta je promenjen",
      description: input.status,
      metadata: jsonValue({ from: project.completionStatus, to: input.status }),
    });
    return updated;
  });
}

export async function getOrganizationAnalytics(organizationId: string) {
  const [projects, offerCount, documentsUploaded, negotiationCount, decisions, outcomes] =
    await Promise.all([
      prisma.importProject.findMany({
        where: { organizationId },
        select: { id: true, createdAt: true },
      }),
      prisma.supplierOffer.count({ where: { organizationId } }),
      prisma.projectActivity.count({
        where: { organizationId, type: ProjectActivityType.DOCUMENT_UPLOADED },
      }),
      prisma.negotiationMessage.count({ where: { organizationId } }),
      prisma.projectDecision.findMany({
        where: { organizationId },
        orderBy: { createdAt: "asc" },
        select: { projectId: true, createdAt: true },
      }),
      prisma.projectOutcome.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
      }),
    ]);
  const firstDecisionByProject = new Map<string, Date>();
  for (const decision of decisions) {
    if (!firstDecisionByProject.has(decision.projectId)) {
      firstDecisionByProject.set(decision.projectId, decision.createdAt);
    }
  }
  const decisionHours = projects.flatMap((project) => {
    const decisionAt = firstDecisionByProject.get(project.id);
    return decisionAt
      ? [(decisionAt.getTime() - project.createdAt.getTime()) / 3_600_000]
      : [];
  });
  const latestOutcomeByProject = new Map<string, (typeof outcomes)[number]>();
  for (const outcome of outcomes) {
    if (!latestOutcomeByProject.has(outcome.projectId)) {
      latestOutcomeByProject.set(outcome.projectId, outcome);
    }
  }
  const latestOutcomes = [...latestOutcomeByProject.values()];

  return {
    usage: {
      projectCount: projects.length,
      offerCount,
      averageOffersPerProject: projects.length ? offerCount / projects.length : 0,
      averageHoursToDecision: decisionHours.length
        ? decisionHours.reduce((sum, value) => sum + value, 0) / decisionHours.length
        : null,
      negotiationMessageCount: negotiationCount,
      documentUploadCount: documentsUploaded,
    },
    accuracy: {
      readyToBuyBought: latestOutcomes.filter(
        (item) => item.decisionStatus === "READY_TO_BUY" && item.outcome === "BOUGHT",
      ).length,
      readyToBuyRecorded: latestOutcomes.filter(
        (item) => item.decisionStatus === "READY_TO_BUY",
      ).length,
      negotiateFirstImproved: latestOutcomes.filter(
        (item) =>
          item.decisionStatus === "NEGOTIATE_FIRST" && item.outcome === "NEGOTIATED",
      ).length,
      negotiateFirstRecorded: latestOutcomes.filter(
        (item) => item.decisionStatus === "NEGOTIATE_FIRST",
      ).length,
      doNotBuyBought: latestOutcomes.filter(
        (item) => item.decisionStatus === "DO_NOT_BUY" && item.outcome === "BOUGHT",
      ).length,
      doNotBuyRecorded: latestOutcomes.filter(
        (item) => item.decisionStatus === "DO_NOT_BUY",
      ).length,
      recordedOutcomeCount: latestOutcomes.length,
    },
  };
}

export { ProjectCompletionStatus };
