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
  const legacyShippingCost = storedDecimalInput(calculation?.shippingCost, "0.00");
  return {
    shippingCost: legacyShippingCost,
    chinaDomesticTransportCost: assumptions?.chinaDomesticTransportCost ?? "0.00",
    internationalTransportCost: assumptions?.internationalTransportCost ?? legacyShippingCost,
    insuranceCost: assumptions?.insuranceCost ?? storedDecimalInput(calculation?.insuranceCost, "0.00"),
    customsBrokerCost: assumptions?.customsBrokerCost ?? "0.00",
    customsDutyRate: storedDecimalInput(calculation?.customsDutyRate, "0"),
    vatRate: storedDecimalInput(calculation?.vatRate, ""),
    vatSource: assumptions?.vatSource ?? "COUNTRY_DEFAULT",
    storageCost: storedDecimalInput(calculation?.storageCost, "0.00"),
    inspectionCost: storedDecimalInput(calculation?.inspectionCost, "0.00"),
    otherCosts: assumptions?.otherCosts ?? storedDecimalInput(calculation?.otherCosts, "0.00"),
    targetSellingPrice: storedDecimalInput(calculation?.targetSellingPrice, ""),
    transportConfirmed: assumptions?.transportConfirmed ?? false,
    customsDutyConfirmed: assumptions?.customsDutyConfirmed ?? false,
    needsReview: calculation?.calculationStatus === "NEEDS_REVIEW",
  };
}
