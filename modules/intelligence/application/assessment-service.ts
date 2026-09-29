import { ProjectActivityType } from "@prisma/client";

import { prisma } from "@/lib/database/prisma";
import { compareOffers } from "@/modules/intelligence/domain/comparison";
import {
  assessOffer,
  type AssessmentOfferInput,
} from "@/modules/intelligence/domain/scoring";
import { recordProjectActivity } from "@/modules/timeline/application/timeline-service";
import { getOfferReadiness, readinessExplanation } from "@/modules/offers/domain/offer-readiness";
import { hasReliableDetailedAssessment } from "@/modules/intelligence/domain/assessment-reliability";
import { getOfferMinimumQuality } from "@/modules/offers/domain/offer-minimum-quality";

export class AssessmentOfferNotFoundError extends Error {}
export class AssessmentProjectNotFoundError extends Error {}
export class AssessmentOfferNotReadyError extends Error {}

export async function assessSupplierOffer(offerId: string, organizationId: string) {
  const offer = await prisma.supplierOffer.findFirst({
    where: { id: offerId, organizationId },
    include: {
      project: true,
      costCalculations: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!offer) throw new AssessmentOfferNotFoundError();
  const metadata = offer.sourceMetadata && typeof offer.sourceMetadata === "object" && !Array.isArray(offer.sourceMetadata)
    ? offer.sourceMetadata as Record<string, unknown>
    : {};
  const quality = getOfferMinimumQuality({
    productTitle: typeof metadata.title === "string" ? metadata.title : offer.project.name,
    requestedProduct: offer.project.name,
    supplierName: offer.supplierName,
    unitPrice: offer.unitPrice,
    currency: offer.currency,
    productUrl: typeof metadata.productUrl === "string" ? metadata.productUrl : null,
    contactEmail: offer.contactEmail,
    contactPhone: offer.contactPhone,
  });
  if (!quality.ready) throw new AssessmentOfferNotReadyError("Ponuda ne ispunjava minimalni kvalitet za analizu.");
  const readiness = getOfferReadiness({
    supplierName: offer.supplierName,
    unitPrice: offer.unitPrice,
    currency: offer.currency,
    moq: offer.moq,
    sourceMetadata: offer.sourceMetadata,
  });
  if (!readiness.ready) {
    throw new AssessmentOfferNotReadyError(readinessExplanation(readiness));
  }

  const comparableOffers = offer.currency
    ? await prisma.supplierOffer.findMany({
        where: {
          projectId: offer.projectId,
          organizationId,
          currency: offer.currency,
          unitPrice: { not: null },
        },
        select: {
          unitPrice: true,
          supplierName: true,
          currency: true,
          moq: true,
          sourceMetadata: true,
        },
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
    landedCostPerUnit: latestCost?.landedCostPerUnit?.toNumber() ?? null,
    grossMarginPercent: latestCost?.grossMarginPercent?.toNumber() ?? null,
  };
  const result = assessOffer(
    input,
    offer.currency
      ? {
          currency: offer.currency,
          unitPrices: comparableOffers.flatMap((item) => {
            const candidateReadiness = getOfferReadiness({
              supplierName: item.supplierName,
              unitPrice: item.unitPrice,
              currency: item.currency,
              moq: item.moq,
              sourceMetadata: item.sourceMetadata,
            });
            return item.unitPrice && candidateReadiness.ready ? [item.unitPrice.toNumber()] : [];
          }),
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
      title: "Ponuda je analizirana",
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
    select: { id: true, name: true },
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
    offers.flatMap((offer) => {
      const metadata = offer.sourceMetadata && typeof offer.sourceMetadata === "object" && !Array.isArray(offer.sourceMetadata)
        ? offer.sourceMetadata as Record<string, unknown>
        : {};
      const quality = getOfferMinimumQuality({
        productTitle: typeof metadata.title === "string" ? metadata.title : project.name,
        requestedProduct: project.name,
        supplierName: offer.supplierName,
        unitPrice: offer.unitPrice,
        currency: offer.currency,
        productUrl: typeof metadata.productUrl === "string" ? metadata.productUrl : null,
        contactEmail: offer.contactEmail,
        contactPhone: offer.contactPhone,
      });
      if (!quality.ready) return [];
      const cost = offer.costCalculations[0] ?? null;
      const assessment = offer.assessments[0] ?? null;
      const assessmentReliable = assessment ? hasReliableDetailedAssessment({
        confidenceScore: assessment.confidenceScore.toNumber(),
        scoreBreakdown: assessment.scoreBreakdown,
      }) : undefined;
      const readiness = getOfferReadiness({
        supplierName: offer.supplierName,
        unitPrice: offer.unitPrice,
        currency: offer.currency,
        moq: offer.moq,
        sourceMetadata: offer.sourceMetadata,
      });
      const exclusionReasons = [
        ...(!readiness.ready ? [readinessExplanation(readiness)] : []),
        ...(cost?.calculationStatus !== "CALCULATED" ? ["Obračun čeka potvrđene podatke."] : []),
      ];
      return [{
        offerId: offer.id,
        supplierName: offer.supplierName,
        currency: offer.currency,
        landedCostTotal: cost?.landedCostTotal?.toNumber() ?? null,
        grossMarginPercent: cost?.grossMarginPercent?.toNumber() ?? null,
        deliveryTimeDays: offer.deliveryTimeDays,
        supplierRiskScore: assessment?.supplierRiskScore ?? null,
        overallScore: assessment?.overallScore ?? null,
        recommendationStatus: assessment?.recommendationStatus ?? null,
        analyzed: assessment !== null,
        assessmentReliable,
        complete: readiness.ready && cost?.calculationStatus === "CALCULATED" && cost.landedCostTotal !== null && cost.grossMarginPercent !== null,
        exclusionReasons,
      }];
    }),
  );
}
