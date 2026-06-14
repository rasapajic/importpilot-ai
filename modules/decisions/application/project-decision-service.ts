import {
  CalculationStatus,
  ProjectActivityType,
  ProjectCompletionStatus,
  type Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/database/prisma";
import {
  createProjectDecision,
  type ProjectDecisionOffer,
  type ProjectDecisionResult,
} from "@/modules/decisions/domain/project-decision";
import { getMoqStatus } from "@/modules/offers/domain/moq-status";
import type { SupplierRiskLevel } from "@/modules/intelligence/domain/supplier-risk-v2";
import { recordProjectActivity } from "@/modules/timeline/application/timeline-service";

export class DecisionProjectNotFoundError extends Error {}

function jsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function supplierRiskLevelFromAssessment(assessment: { scoreBreakdown: Prisma.JsonValue } | null) {
  if (!assessment?.scoreBreakdown || typeof assessment.scoreBreakdown !== "object" || Array.isArray(assessment.scoreBreakdown)) {
    return undefined;
  }
  const breakdown = assessment.scoreBreakdown as { supplierRiskV2?: { riskLevel?: SupplierRiskLevel } };
  return breakdown.supplierRiskV2?.riskLevel;
}

export async function generateProjectDecision(projectId: string, organizationId: string) {
  const project = await prisma.importProject.findFirst({
    where: { id: projectId, organizationId },
    include: {
      offers: {
        include: {
          costCalculations: { orderBy: { createdAt: "desc" }, take: 1 },
          assessments: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      },
    },
  });
  if (!project) throw new DecisionProjectNotFoundError();

  const offers: ProjectDecisionOffer[] = project.offers.map((offer) => {
    const cost = offer.costCalculations[0] ?? null;
    const assessment = offer.assessments[0] ?? null;
    return {
      offerId: offer.id,
      supplierName: offer.supplierName,
      currency: offer.currency,
      incoterm: offer.incoterm,
      moq: offer.moq,
      moqExceedsProjectQuantity: offer.moq === null ? null : offer.moq > project.quantity,
      moqStatus: getMoqStatus({ projectQuantity: project.quantity, moq: offer.moq }),
      sampleAvailable: offer.sampleAvailable,
      shippingClarityScore: offer.shippingClarityScore,
      landedCostTotal: cost?.landedCostTotal.toNumber() ?? null,
      landedCostPerUnit: cost?.landedCostPerUnit.toNumber() ?? null,
      grossMarginPercent: cost?.grossMarginPercent.toNumber() ?? null,
      calculationNeedsReview:
        cost === null || cost.calculationStatus === CalculationStatus.NEEDS_REVIEW,
      assessment: assessment
        ? {
            overallScore: assessment.overallScore,
            supplierRiskScore: assessment.supplierRiskScore,
            supplierRiskLevel: supplierRiskLevelFromAssessment(assessment),
            confidenceScore: assessment.confidenceScore.toNumber(),
            recommendationStatus: assessment.recommendationStatus,
          }
        : null,
    };
  });
  const decision = createProjectDecision(offers);

  return prisma.$transaction(async (transaction) => {
    const created = await transaction.projectDecision.create({
      data: {
      organizationId,
      projectId,
      selectedOfferId: decision.selectedOfferId,
      status: decision.status,
      decisionReason: decision.decisionReason,
      actionChecklist: jsonValue(decision.actionChecklist),
      summarySnapshot: jsonValue(decision.summarySnapshot),
      decisionVersion: decision.decisionVersion,
      },
    });
    if (project.completionStatus === ProjectCompletionStatus.ACTIVE) {
      await transaction.importProject.update({
        where: { id: projectId },
        data: { completionStatus: ProjectCompletionStatus.DECIDED },
      });
      await transaction.projectCompletionHistory.create({
        data: {
          organizationId,
          projectId,
          status: ProjectCompletionStatus.DECIDED,
        },
      });
      await recordProjectActivity(transaction, {
        organizationId,
        projectId,
        type: ProjectActivityType.PROJECT_COMPLETION_CHANGED,
        title: "Status završetka projekta je promenjen",
        description: ProjectCompletionStatus.DECIDED,
        metadata: { from: ProjectCompletionStatus.ACTIVE, to: ProjectCompletionStatus.DECIDED },
      });
    }
    await recordProjectActivity(transaction, {
      organizationId,
      projectId,
      type: ProjectActivityType.FINAL_DECISION_CREATED,
      title: "Finalna projektna odluka je kreirana",
      description: decision.status,
      metadata: { decisionId: created.id, status: decision.status },
    });
    return created;
  });
}

export async function getLatestProjectDecision(
  projectId: string,
  organizationId: string,
): Promise<(ProjectDecisionResult & { id: string; createdAt: Date }) | null> {
  const decision = await prisma.projectDecision.findFirst({
    where: { projectId, organizationId },
    orderBy: { createdAt: "desc" },
  });
  if (!decision) return null;

  return {
    id: decision.id,
    createdAt: decision.createdAt,
    status: decision.status,
    selectedOfferId: decision.selectedOfferId,
    decisionReason: decision.decisionReason,
    actionChecklist: decision.actionChecklist as ProjectDecisionResult["actionChecklist"],
    summarySnapshot: decision.summarySnapshot as ProjectDecisionResult["summarySnapshot"],
    decisionVersion: decision.decisionVersion,
  };
}
