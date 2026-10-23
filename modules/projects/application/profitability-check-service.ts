import { prisma } from "@/lib/database/prisma";
import { latestCalculationIfCurrent } from "@/modules/cost-engine/domain/current-calculation";
import { generateProjectDecision } from "@/modules/decisions/application/project-decision-service";
import { assessSupplierOffer } from "@/modules/intelligence/application/assessment-service";

export class ProfitabilityProjectNotFoundError extends Error {}
export class ProfitabilityNoCalculatedOffersError extends Error {}

export async function checkProjectProfitability(
  projectId: string,
  organizationId: string,
  offerId?: string,
) {
  const project = await prisma.importProject.findFirst({
    where: { id: projectId, organizationId },
    select: {
      id: true,
      offers: {
        where: offerId ? { id: offerId } : undefined,
        select: {
          id: true,
          unitPrice: true,
          currency: true,
          costCalculations: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { id: true, unitPrice: true, currency: true },
          },
          assessments: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { costCalculationId: true },
          },
        },
      },
    },
  });

  if (!project) throw new ProfitabilityProjectNotFoundError();

  const calculatedOffers = project.offers.flatMap((offer) => {
    const current = latestCalculationIfCurrent(offer.costCalculations, offer);
    return current ? [{ ...offer, costCalculations: [current] }] : [];
  });
  if (calculatedOffers.length === 0) {
    throw new ProfitabilityNoCalculatedOffersError();
  }

  for (const offer of calculatedOffers) {
    const latestCalculationId = offer.costCalculations[0].id;
    const latestAssessmentCalculationId = offer.assessments[0]?.costCalculationId ?? null;
    if (latestAssessmentCalculationId !== latestCalculationId) {
      await assessSupplierOffer(offer.id, organizationId);
    }
  }

  return generateProjectDecision(projectId, organizationId, offerId);
}