import { prisma } from "@/lib/database/prisma";
import { generateProjectDecision } from "@/modules/decisions/application/project-decision-service";
import { assessSupplierOffer } from "@/modules/intelligence/application/assessment-service";

export class ProfitabilityProjectNotFoundError extends Error {}
export class ProfitabilityNoCalculatedOffersError extends Error {}

export async function checkProjectProfitability(
  projectId: string,
  organizationId: string,
) {
  const project = await prisma.importProject.findFirst({
    where: { id: projectId, organizationId },
    select: {
      id: true,
      offers: {
        select: {
id: true,
costCalculations: {
  orderBy: { createdAt: "desc" },
  take: 1,
  select: { id: true },
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

  const calculatedOffers = project.offers.filter(
    (offer) => offer.costCalculations.length > 0,
  );
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

  return generateProjectDecision(projectId, organizationId);
}
