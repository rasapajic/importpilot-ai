import { ProjectActivityType } from "@prisma/client";
import type { z } from "zod";

import { prisma } from "@/lib/database/prisma";
import { calculateLandedCost } from "@/modules/cost-engine/domain/calculator";
import type { costCalculationRequestSchema } from "@/modules/cost-engine/domain/validation";
import { recordProjectActivity } from "@/modules/timeline/application/timeline-service";

type CostRequest = z.infer<typeof costCalculationRequestSchema>;

export class CostOfferNotFoundError extends Error {}
export class IncompleteOfferError extends Error {}

export async function createCostCalculation(
  offerId: string,
  organizationId: string,
  request: CostRequest,
) {
  const offer = await prisma.supplierOffer.findFirst({
    where: { id: offerId, organizationId },
    include: { project: true },
  });
  if (!offer) throw new CostOfferNotFoundError();
  if (offer.unitPrice === null || !offer.currency || !offer.incoterm) {
    throw new IncompleteOfferError();
  }

  const result = calculateLandedCost({
    targetCountry: offer.project.targetCountry,
    quantity: offer.project.quantity,
    unitPrice: offer.unitPrice.toString(),
    currency: offer.currency,
    incoterm: offer.incoterm,
    shippingCost: request.shippingCost,
    customsDutyRate: request.customsDutyRate,
    vatRate: request.vatRate,
    storageCost: request.storageCost,
    inspectionCost: request.inspectionCost,
    otherCosts: request.otherCosts,
    targetSellingPrice: request.targetSellingPrice,
  });

  return prisma.$transaction(async (transaction) => {
    const calculation = await transaction.costCalculation.create({
      data: {
        organizationId,
        projectId: offer.projectId,
        offerId,
        ...result,
        calculationStatus: request.calculationStatus,
      },
    });
    await recordProjectActivity(transaction, {
      organizationId,
      projectId: offer.projectId,
      type: ProjectActivityType.LANDED_COST_CALCULATED,
      title: "Landed cost je izračunat",
      description: offer.supplierName,
      metadata: {
        offerId,
        supplierName: offer.supplierName,
        calculationStatus: calculation.calculationStatus,
      },
    });
    return calculation;
  });
}
