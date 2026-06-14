import { ProjectActivityType } from "@prisma/client";

import { prisma } from "@/lib/database/prisma";
import { compareOffers } from "@/modules/intelligence/domain/comparison";
import {
  assessOffer,
  type AssessmentOfferInput,
} from "@/modules/intelligence/domain/scoring";
import { recordProjectActivity } from "@/modules/timeline/application/timeline-service";

export class AssessmentOfferNotFoundError extends Error {}
export class AssessmentProjectNotFoundError extends Error {}

export async function assessSupplierOffer(offerId: string, organizationId: string) {
  const offer = await prisma.supplierOffer.findFirst({
    where: { id: offerId, organizationId },
    include: {
      project: true,
      costCalculations: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!offer) throw new AssessmentOfferNotFoundError();

  const comparableOffers = offer.currency
    ? await prisma.supplierOffer.findMany({
        where: {
          projectId: offer.projectId,
          organizationId,
          currency: offer.currency,
          unitPrice: { not: null },
        },
        select: { unitPrice: true },
      })
    : [];
  const latestCost = offer.costCalculations[0] ?? null;
  const input: AssessmentOfferInput = {
    offerId: offer.id,
    supplierName: offer.supplierName,
    supplierCountry: offer.supplierCountry,
    supplierVerified: offer.supplierVerified,
    yearsOnPlatform: offer.yearsOnPlatform,
    responseRatePercent: offer.responseRatePercent?.toNumber() ?? null,
    transactionCount: offer.transactionCount,
    employeeCount: offer.employeeCount,
    profileCompletenessScore: offer.profileCompletenessScore,
    moq: offer.moq,
    unitPrice: offer.unitPrice?.toNumber() ?? null,
    currency: offer.currency,
    incoterm: offer.incoterm,
    deliveryTimeDays: offer.deliveryTimeDays,
    sampleAvailable: offer.sampleAvailable,
    termsClarityScore: offer.termsClarityScore,
    shippingClarityScore: offer.shippingClarityScore,
    projectQuantity: offer.project.quantity,
    projectTargetMargin: offer.project.targetMargin.toNumber(),
    landedCostPerUnit: latestCost?.landedCostPerUnit.toNumber() ?? null,
    grossMarginPercent: latestCost?.grossMarginPercent.toNumber() ?? null,
  };
  const result = assessOffer(
    input,
    offer.currency
      ? {
          currency: offer.currency,
          unitPrices: comparableOffers.flatMap((item) =>
            item.unitPrice ? [item.unitPrice.toNumber()] : [],
          ),
        }
      : undefined,
  );

  return prisma.$transaction(async (transaction) => {
    const assessment = await transaction.offerAssessment.create({
      data: {
      organizationId,
      projectId: offer.projectId,
      offerId: offer.id,
      costCalculationId: latestCost?.id,
      supplierRiskScore: result.supplierRiskScore,
      offerQualityScore: result.offerQualityScore,
      overallScore: result.overallScore,
      confidenceScore: result.confidenceScore,
      recommendationStatus: result.recommendationStatus,
      explanation: result.explanation,
      scoreBreakdown: result.scoreBreakdown,
      assessmentVersion: result.assessmentVersion,
      },
    });
    await recordProjectActivity(transaction, {
      organizationId,
      projectId: offer.projectId,
      type: ProjectActivityType.ASSESSMENT_COMPLETED,
      title: "Ocena ponude je završena",
      description: offer.supplierName,
      metadata: {
        offerId,
        supplierName: offer.supplierName,
        recommendationStatus: assessment.recommendationStatus,
      },
    });
    return assessment;
  });
}

export async function compareProjectOffers(projectId: string, organizationId: string) {
  const project = await prisma.importProject.findFirst({
    where: { id: projectId, organizationId },
    select: { id: true },
  });
  if (!project) throw new AssessmentProjectNotFoundError();

  const offers = await prisma.supplierOffer.findMany({
    where: { projectId, organizationId },
    include: {
      costCalculations: { orderBy: { createdAt: "desc" }, take: 1 },
      assessments: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  return compareOffers(
    offers.map((offer) => {
      const cost = offer.costCalculations[0] ?? null;
      const assessment = offer.assessments[0] ?? null;
      return {
        offerId: offer.id,
        supplierName: offer.supplierName,
        currency: offer.currency,
        landedCostTotal: cost?.landedCostTotal.toNumber() ?? null,
        grossMarginPercent: cost?.grossMarginPercent.toNumber() ?? null,
        deliveryTimeDays: offer.deliveryTimeDays,
        supplierRiskScore: assessment?.supplierRiskScore ?? null,
        overallScore: assessment?.overallScore ?? null,
        recommendationStatus: assessment?.recommendationStatus ?? null,
      };
    }),
  );
}
