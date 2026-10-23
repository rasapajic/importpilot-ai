import { CalculationStatus, Prisma, ProjectActivityType } from "@prisma/client";
import type { z } from "zod";

import { prisma } from "@/lib/database/prisma";
import { calculateLandedCost } from "@/modules/cost-engine/domain/calculator";
import { getImportCountryProfile } from "@/modules/cost-engine/domain/import-country-profiles";
import { isSupportedLandedCostIncoterm } from "@/modules/cost-engine/domain/incoterms";
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
export class UnsupportedLandedCostIncotermError extends Error {
  constructor(readonly incoterm: string) {
    super(`ImportPilot 1.0 ne računa potvrđeni ukupan trošak uvoza za uslov isporuke ${incoterm}.`);
  }
}

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
  const unitPrice = offer.unitPrice;
  const currency = offer.currency;
  const incoterm = offer.incoterm;
  if (unitPrice === null || !currency || !incoterm) {
    throw new IncompleteOfferError();
  }
  if (!isSupportedLandedCostIncoterm(incoterm)) {
    throw new UnsupportedLandedCostIncotermError(incoterm);
  }

  const previous = await prisma.costCalculation.findFirst({
    where: { offerId, organizationId },
    orderBy: { createdAt: "desc" },
  });
  const carriedFreight = previous?.freightForwardingCost ?? null;
  const carriedEvidence = previous?.costEvidence == null
    ? undefined
    : previous.costEvidence as Prisma.InputJsonValue;
  const profile = getImportCountryProfile(offer.project.targetCountry);
  const explicitInsurance = normalizedRequest.insuranceCost;
  const explicitBroker = normalizedRequest.customsBrokerCost;
  const explicitChina = normalizedRequest.chinaDomesticTransportCost;
  const explicitInternational = normalizedRequest.internationalTransportCost;
  const explicitShipping = normalizedRequest.shippingCost;
  const breakdownKnown = explicitChina !== undefined
    && explicitInternational !== undefined
    && explicitInsurance !== undefined
    && explicitBroker !== undefined;
  const confirmedInputsReady = profile ? breakdownKnown : explicitShipping !== undefined;
  const preservedInsurance = explicitInsurance !== undefined
    ? explicitInsurance
    : previous?.insuranceCost ?? null;

  if (!confirmedInputsReady) {
    return prisma.$transaction(async (transaction) => {
      const calculation = await transaction.costCalculation.create({
        data: {
          organizationId,
          projectId: offer.projectId,
          offerId,
          targetCountry: offer.project.targetCountry,
          quantity: offer.project.quantity,
          unitPrice,
          currency,
          incoterm,
          shippingCost: explicitShipping ?? null,
          customsDutyRate: normalizedRequest.customsDutyRate,
          vatRate: normalizedRequest.vatRate,
          storageCost: normalizedRequest.storageCost,
          inspectionCost: normalizedRequest.inspectionCost,
          otherCosts: normalizedRequest.otherCosts,
          targetSellingPrice: normalizedRequest.targetSellingPrice,
          insuranceCost: preservedInsurance,
          freightForwardingCost: carriedFreight,
          ...(carriedEvidence !== undefined ? { costEvidence: carriedEvidence } : {}),
          calculationStatus: CalculationStatus.NEEDS_REVIEW,
        },
      });
      await recordProjectActivity(transaction, {
        organizationId,
        projectId: offer.projectId,
        type: ProjectActivityType.LANDED_COST_CALCULATED,
        title: "Obračun nije potvrđen jer nedostaju troškovi",
        description: offer.supplierName,
        metadata: {
          calculationId: calculation.id,
          offerId,
          supplierName: offer.supplierName,
          calculationStatus: calculation.calculationStatus,
          customsDutyRate: normalizedRequest.customsDutyRate,
          vatRate: normalizedRequest.vatRate,
        },
      });
      return calculation;
    });
  }

  let assumptions: LandedCostAssumptions | null = profile
    && explicitChina !== undefined
    && explicitInternational !== undefined
    && explicitInsurance !== undefined
    && explicitBroker !== undefined
    ? createLandedCostAssumptions({
        countryCode: profile.countryCode,
        chinaDomesticTransportCost: explicitChina,
        internationalTransportCost: explicitInternational,
        insuranceCost: explicitInsurance,
        customsBrokerCost: explicitBroker,
        otherCosts: normalizedRequest.otherCosts,
        transportConfirmed: normalizedRequest.transportConfirmed,
        customsDutyConfirmed: normalizedRequest.customsDutyConfirmed,
        vatSource: normalizedRequest.vatSource,
      })
    : null;

  if (
    assumptions &&
    explicitShipping !== undefined &&
    totalImportTransportCost(assumptions) === "0.00"
  ) {
    assumptions = createLandedCostAssumptions({
      countryCode: assumptions.countryCode,
      chinaDomesticTransportCost: assumptions.chinaDomesticTransportCost,
      internationalTransportCost: explicitShipping,
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
    : explicitShipping;
  if (shippingCost === undefined) throw new Error("Transport nije unet.");
  const customsBrokerCost = assumptions?.customsBrokerCost ?? explicitBroker ?? "0.00";
  const otherCosts = assumptions?.otherCosts ?? normalizedRequest.otherCosts;

  const result = calculateLandedCost({
    targetCountry: offer.project.targetCountry,
    quantity: offer.project.quantity,
    unitPrice: unitPrice.toString(),
    currency,
    incoterm,
    shippingCost,
    customsDutyRate: normalizedRequest.customsDutyRate,
    vatRate: normalizedRequest.vatRate,
    storageCost: normalizedRequest.storageCost,
    inspectionCost: normalizedRequest.inspectionCost,
    customsBrokerCost,
    otherCosts,
    targetSellingPrice: normalizedRequest.targetSellingPrice,
  });

  const calculationStatus = carriedFreight != null || (profile && requiresImportCostReview({
    targetCountry: profile.countryCode,
    transportConfirmed: assumptions?.transportConfirmed ?? false,
    customsDutyConfirmed: assumptions?.customsDutyConfirmed ?? false,
    vatRate: normalizedRequest.vatRate,
    vatSource: normalizedRequest.vatSource,
  }))
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
        insuranceCost: preservedInsurance,
        freightForwardingCost: carriedFreight,
        ...(carriedEvidence !== undefined ? { costEvidence: carriedEvidence } : {}),
        calculationStatus,
      },
    });
    await recordProjectActivity(transaction, {
      organizationId,
      projectId: offer.projectId,
      type: ProjectActivityType.LANDED_COST_CALCULATED,
      title: calculationStatus === CalculationStatus.CALCULATED
        ? profile
          ? `Stvarna cena do magacina (${profile.countryCode}) je izračunata`
          : "Ukupan trošak uvoza je izračunat"
        : "Obračun nije potvrđen jer nedostaju troškovi",
      description: offer.supplierName,
      metadata: {
        calculationId: calculation.id,
        offerId,
        supplierName: offer.supplierName,
        calculationStatus: calculation.calculationStatus,
        shippingCost,
        customsDutyRate: normalizedRequest.customsDutyRate,
        vatRate: normalizedRequest.vatRate,
        ...(profile && assumptions ? {
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