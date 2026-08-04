import { CalculationStatus, ProjectActivityType } from "@prisma/client";
import type { z } from "zod";

import { prisma } from "@/lib/database/prisma";
import { calculateLandedCost } from "@/modules/cost-engine/domain/calculator";
import { getImportCountryProfile } from "@/modules/cost-engine/domain/import-country-profiles";
import {
  createLandedCostAssumptions,
  requiresImportCostReview,
  sumCostAmounts,
  totalImportTransportCost,
  type LandedCostAssumptions,
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

  const profile = getImportCountryProfile(offer.project.targetCountry);
  let assumptions: LandedCostAssumptions | null = profile
    ? createLandedCostAssumptions({
        countryCode: profile.countryCode,
        chinaDomesticTransportCost: normalizedRequest.chinaDomesticTransportCost,
        internationalTransportCost: normalizedRequest.internationalTransportCost,
        insuranceCost: normalizedRequest.insuranceCost,
        customsBrokerCost: normalizedRequest.customsBrokerCost,
        otherCosts: normalizedRequest.otherCosts,
        transportConfirmed: normalizedRequest.transportConfirmed,
        customsDutyConfirmed: normalizedRequest.customsDutyConfirmed,
        vatSource: normalizedRequest.vatSource,
      })
    : null;

  if (
    assumptions &&
    normalizedRequest.shippingCost !== undefined &&
    totalImportTransportCost(assumptions) === "0.00"
  ) {
    assumptions = createLandedCostAssumptions({
      countryCode: assumptions.countryCode,
      chinaDomesticTransportCost: assumptions.chinaDomesticTransportCost,
      internationalTransportCost: normalizedRequest.shippingCost,
      insuranceCost: assumptions.insuranceCost,
      customsBrokerCost: assumptions.customsBrokerCost,
      otherCosts: assumptions.otherCosts,
      transportConfirmed: assumptions.transportConfirmed,
      customsDutyConfirmed: assumptions.customsDutyConfirmed,
      vatSource: assumptions.vatSource,
    });
  }

  const shippingCost = assumptions
    ? totalImportTransportCost(assumptions)
    : normalizedRequest.shippingCost ?? sumCostAmounts([
        normalizedRequest.chinaDomesticTransportCost,
        normalizedRequest.internationalTransportCost,
        normalizedRequest.insuranceCost,
      ]);
  const customsBrokerCost = assumptions?.customsBrokerCost ?? normalizedRequest.customsBrokerCost;
  const otherCosts = assumptions?.otherCosts ?? normalizedRequest.otherCosts;

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
    customsBrokerCost,
    otherCosts,
    targetSellingPrice: normalizedRequest.targetSellingPrice,
  });

  const calculationStatus = profile && requiresImportCostReview({
    targetCountry: profile.countryCode,
    transportConfirmed: assumptions?.transportConfirmed ?? false,
    customsDutyConfirmed: assumptions?.customsDutyConfirmed ?? false,
    vatRate: normalizedRequest.vatRate,
    vatSource: normalizedRequest.vatSource,
  })
    ? CalculationStatus.NEEDS_REVIEW
    : normalizedRequest.calculationStatus;
  const {
    customsBrokerCost: calculatedBrokerCost,
    otherCosts: calculatedOtherCosts,
    ...persistedResult
  } = result;

  return prisma.$transaction(async (transaction) => {
    const calculation = await transaction.costCalculation.create({
      data: {
        organizationId,
        projectId: offer.projectId,
        offerId,
        ...persistedResult,
        otherCosts: sumCostAmounts([calculatedOtherCosts, calculatedBrokerCost]),
        calculationStatus,
      },
    });
    await recordProjectActivity(transaction, {
      organizationId,
      projectId: offer.projectId,
      type: ProjectActivityType.LANDED_COST_CALCULATED,
      title: profile
        ? `Stvarna cena do magacina (${profile.countryCode}) je izračunata`
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
        ...(profile ? {
          countryProfile: {
            countryCode: profile.countryCode,
            version: profile.version,
            defaultVatRate: profile.defaultVatRate,
          },
          costAssumptions: assumptions,
        } : {}),
      },
    });
    return calculation;
  });
}
