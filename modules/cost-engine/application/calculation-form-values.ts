import type { CostCalculation } from "@prisma/client";

import type { SerbiaLandedCostAssumptions } from "@/modules/cost-engine/domain/serbia-landed-cost";

export function getCalculationFormValues(
  calculation?: CostCalculation,
  assumptions?: SerbiaLandedCostAssumptions | null,
) {
  const legacyShippingCost = calculation?.shippingCost.toString() ?? "0.00";
  return {
    shippingCost: legacyShippingCost,
    chinaDomesticTransportCost: assumptions?.chinaDomesticTransportCost ?? "0.00",
    internationalTransportCost: assumptions?.internationalTransportCost ?? legacyShippingCost,
    insuranceCost: assumptions?.insuranceCost ?? "0.00",
    customsBrokerCost: assumptions?.customsBrokerCost ?? "0.00",
    customsDutyRate: calculation?.customsDutyRate.toString() ?? "0",
    vatRate: calculation?.vatRate.toString() ?? "",
    vatSource: assumptions?.vatSource ?? "COUNTRY_DEFAULT",
    storageCost: calculation?.storageCost.toString() ?? "0.00",
    inspectionCost: calculation?.inspectionCost.toString() ?? "0.00",
    otherCosts: assumptions?.otherCosts ?? calculation?.otherCosts.toString() ?? "0.00",
    targetSellingPrice: calculation?.targetSellingPrice.toString() ?? "",
    transportConfirmed: assumptions?.transportConfirmed ?? false,
    customsDutyConfirmed: assumptions?.customsDutyConfirmed ?? false,
    needsReview: calculation?.calculationStatus === "NEEDS_REVIEW",
  };
}
