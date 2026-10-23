import type { CostCalculation } from "@prisma/client";

import type { SerbiaLandedCostAssumptions } from "@/modules/cost-engine/domain/serbia-landed-cost";

function storedDecimalInput(
  value: { toString(): string } | null | undefined,
  whenMissing: string,
) {
  if (value === null) return "";
  if (value === undefined) return whenMissing;
  return value.toString();
}

export function getCalculationFormValues(
  calculation?: CostCalculation,
  assumptions?: SerbiaLandedCostAssumptions | null,
) {
  const legacyShippingCost = storedDecimalInput(calculation?.shippingCost, "");
  return {
    shippingCost: legacyShippingCost,
    chinaDomesticTransportCost: assumptions?.chinaDomesticTransportCost ?? "",
    internationalTransportCost: assumptions?.internationalTransportCost ?? legacyShippingCost,
    insuranceCost: assumptions?.insuranceCost ?? storedDecimalInput(calculation?.insuranceCost, ""),
    customsBrokerCost: assumptions?.customsBrokerCost ?? "",
    customsDutyRate: storedDecimalInput(calculation?.customsDutyRate, ""),
    vatRate: storedDecimalInput(calculation?.vatRate, ""),
    vatSource: assumptions?.vatSource ?? "COUNTRY_DEFAULT",
    storageCost: storedDecimalInput(calculation?.storageCost, ""),
    inspectionCost: storedDecimalInput(calculation?.inspectionCost, ""),
    otherCosts: assumptions?.otherCosts ?? storedDecimalInput(calculation?.otherCosts, ""),
    targetSellingPrice: storedDecimalInput(calculation?.targetSellingPrice, ""),
    transportConfirmed: assumptions?.transportConfirmed ?? false,
    customsDutyConfirmed: assumptions?.customsDutyConfirmed ?? false,
    needsReview: calculation?.calculationStatus === "NEEDS_REVIEW",
  };
}
