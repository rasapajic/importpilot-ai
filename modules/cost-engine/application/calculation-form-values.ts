import type { CostCalculation } from "@prisma/client";

export function getCalculationFormValues(calculation?: CostCalculation) {
  return {
    shippingCost: calculation?.shippingCost.toString() ?? "0.00",
    customsDutyRate: calculation?.customsDutyRate.toString() ?? "0",
    vatRate: calculation?.vatRate.toString() ?? "",
    storageCost: calculation?.storageCost.toString() ?? "0.00",
    inspectionCost: calculation?.inspectionCost.toString() ?? "0.00",
    otherCosts: calculation?.otherCosts.toString() ?? "0.00",
    targetSellingPrice: calculation?.targetSellingPrice.toString() ?? "",
    needsReview: calculation?.calculationStatus === "NEEDS_REVIEW",
  };
}
