import { CalculationStatus, ProjectActivityType, type Prisma } from "@prisma/client";
import type { z } from "zod";

import { prisma } from "@/lib/database/prisma";
import { calculateProgressiveLandedCost } from "@/modules/cost-engine/domain/progressive-calculator";
import type { costCalculationRequestSchema } from "@/modules/cost-engine/domain/validation";
import { recordProjectActivity } from "@/modules/timeline/application/timeline-service";

type CostRequest = z.infer<typeof costCalculationRequestSchema>;

export class CostOfferNotFoundError extends Error {}
export class IncompleteOfferError extends Error {}

function jsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

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

  const sourceMetadata = offer.sourceMetadata && typeof offer.sourceMetadata === "object" && !Array.isArray(offer.sourceMetadata)
    ? offer.sourceMetadata as Record<string, unknown>
    : {};
  const metadataCustomsProvenance = sourceMetadata.customsProvenance && typeof sourceMetadata.customsProvenance === "object" && !Array.isArray(sourceMetadata.customsProvenance)
    ? sourceMetadata.customsProvenance as never
    : null;
  const customsProvenance = request.customsProvenance ?? metadataCustomsProvenance;
  const result = calculateProgressiveLandedCost({
    targetCountry: offer.project.targetCountry,
    quantity: offer.project.quantity,
    unitPrice: offer.unitPrice.toString(),
    currency: offer.currency,
    incoterm: offer.incoterm,
    shippingCost: request.shippingCost,
    shippingStatus: request.shippingStatus,
    insuranceCost: request.insuranceCost,
    insuranceStatus: request.insuranceStatus,
    customsDutyRate: request.customsDutyRate,
    customsDutyStatus: request.customsDutyStatus,
    vatRate: request.vatRate,
    vatStatus: request.vatStatus,
    freightForwardingCost: request.freightForwardingCost,
    freightForwardingStatus: request.freightForwardingStatus,
    storageCost: request.storageCost,
    storageStatus: request.storageStatus,
    inspectionCost: request.inspectionCost,
    inspectionStatus: request.inspectionStatus,
    otherCosts: request.otherCosts,
    otherStatus: request.otherStatus,
    targetSellingPrice: request.targetSellingPrice,
    vatTreatment: request.vatTreatment,
    customsProvenance,
    shippingEstimate: request.shippingEstimate ?? null,
  });

  return prisma.$transaction(async (transaction) => {
    const calculation = await transaction.costCalculation.create({
      data: {
        organizationId,
        projectId: offer.projectId,
        offerId,
        targetCountry: result.targetCountry,
        quantity: result.quantity,
        unitPrice: result.unitPrice,
        currency: result.currency,
        incoterm: result.incoterm,
        shippingCost: result.shippingCost,
        insuranceCost: result.insuranceCost,
        customsDutyRate: result.customsDutyRate,
        customsDutyAmount: result.customsDutyAmount,
        vatRate: result.vatRate,
        vatAmount: result.vatAmount,
        freightForwardingCost: result.freightForwardingCost,
        storageCost: result.storageCost,
        inspectionCost: result.inspectionCost,
        otherCosts: result.otherCosts,
        knownCostTotal: result.knownCostTotal,
        landedCostTotal: result.landedCostTotal,
        landedCostPerUnit: result.landedCostPerUnit,
        targetSellingPrice: result.targetSellingPrice,
        grossMarginPercent: result.grossMarginPercent,
        breakEvenPrice: result.breakEvenPrice,
        requiredCashTotal: result.requiredCashTotal,
        netAcquisitionCost: result.netAcquisitionCost,
        vatTreatment: request.vatTreatment,
        costEvidence: jsonValue(result.costEvidence),
        calculationStatus: result.isReliable
          ? request.calculationStatus
          : CalculationStatus.NEEDS_REVIEW,
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
