import { CalculationStatus, ProjectActivityType } from "@prisma/client";
import type { z } from "zod";

import { prisma } from "@/lib/database/prisma";
import { calculateLandedCost } from "@/modules/cost-engine/domain/calculator";
import {
  requiresSerbiaCostReview,
  SERBIA_LANDED_COST_VERSION,
  sumCostAmounts,
  totalSerbiaTransportCost,
  type SerbiaLandedCostAssumptions,
} from "@/modules/cost-engine/domain/serbia-landed-cost";
import { costCalculationRequestSchema } from "@/modules/cost-engine/domain/validation";
import { recordProjectActivity } from "@/modules/timeline/application/timeline-service";

type CostRequest = z.input<typeof costCalculationRequestSchema>;

export class CostOfferNotFoundError extends Error {}
export class IncompleteOfferError extends Error {}

export async function createCostCalculation(
  offerId: string,
  organizationId: string,
  request: CostRequest,
) {
  const normalizedRequest = costCalculationRequestSchema.parse(request);
  const offer = await prisma.supplierOffer.findFirst({
    where: { id: offerId, organizationId },
    include: { project: true },
  });
  if (!offer) throw new CostOfferNotFoundError();
  if (offer.unitPrice === null || !offer.currency || !offer.incoterm) {
    throw new IncompleteOfferError();
  }

  const rawAssumptions: SerbiaLandedCostAssumptions = {
    version: SERBIA_LANDED_COST_VERSION,
    chinaDomesticTransportCost: normalizedRequest.chinaDomesticTransportCost,
    internationalTransportCost: normalizedRequest.internationalTransportCost,
    insuranceCost: normalizedRequest.insuranceCost,
    customsBrokerCost: normalizedRequest.customsBrokerCost,
    otherCosts: normalizedRequest.otherCosts,
    transportConfirmed: normalizedRequest.transportConfirmed,
    customsDutyConfirmed: normalizedRequest.customsDutyConfirmed,
    vatSource: normalizedRequest.vatSource,
  };
  const rawComponentTransport = totalSerbiaTransportCost(rawAssumptions);
  const assumptions: SerbiaLandedCostAssumptions =
    offer.project.targetCountry === "RS" &&
    normalizedRequest.shippingCost !== undefined &&
    rawComponentTransport === "0.00"
      ? { ...rawAssumptions, internationalTransportCost: normalizedRequest.shippingCost }
      : rawAssumptions;
  const componentTransport = totalSerbiaTransportCost(assumptions);
  const shippingCost = componentTransport !== "0.00" || normalizedRequest.shippingCost === undefined
    ? componentTransport
    : normalizedRequest.shippingCost;

  const result = calculateLandedCost({
    targetCountry: offer.project.targetCountry,
    quantity: offer.project.quantity,
    unitPrice: offer.unitPrice.toString(),
    currency: offer.currency,
    incoterm: offer.incoterm,
    shippingCost,
    customsDutyRate: normalizedRequest.customsDutyRate,
    vatRate: normalizedRequest.vatRate,
    storageCost: normalizedRequest.storageCost,
    inspectionCost: normalizedRequest.inspectionCost,
    customsBrokerCost: assumptions.customsBrokerCost,
    otherCosts: assumptions.otherCosts,
    targetSellingPrice: normalizedRequest.targetSellingPrice,
  });

  const calculationStatus = requiresSerbiaCostReview({
    targetCountry: offer.project.targetCountry,
    transportConfirmed: assumptions.transportConfirmed,
    customsDutyConfirmed: assumptions.customsDutyConfirmed,
  })
    ? CalculationStatus.NEEDS_REVIEW
    : normalizedRequest.calculationStatus;
  const {
    customsBrokerCost,
    otherCosts,
    ...persistedResult
  } = result;

  return prisma.$transaction(async (transaction) => {
    const calculation = await transaction.costCalculation.create({
      data: {
        organizationId,
        projectId: offer.projectId,
        offerId,
        ...persistedResult,
        otherCosts: sumCostAmounts([otherCosts, customsBrokerCost]),
        calculationStatus,
      },
    });
    await recordProjectActivity(transaction, {
      organizationId,
      projectId: offer.projectId,
      type: ProjectActivityType.LANDED_COST_CALCULATED,
      title: offer.project.targetCountry === "RS"
        ? "Stvarna cena do Srbije je izračunata"
        : "Landed cost je izračunat",
      description: offer.supplierName,
      metadata: {
        calculationId: calculation.id,
        offerId,
        supplierName: offer.supplierName,
        calculationStatus: calculation.calculationStatus,
        shippingCost,
        customsDutyRate: normalizedRequest.customsDutyRate,
        vatRate: normalizedRequest.vatRate,
        costAssumptions: assumptions,
      },
    });
    return calculation;
  });
}
