import type { CostCalculation } from "@prisma/client";

import { CostEvidenceStatuses, VatTreatments, type CostEvidenceSnapshot } from "../domain/cost-evidence";

function evidence(calculation?: CostCalculation) {
  const value = calculation?.costEvidence;
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as unknown as CostEvidenceSnapshot
    : null;
}

export function getCalculationFormValues(calculation?: CostCalculation) {
  const snapshot = evidence(calculation);
  return {
    shippingCost: calculation?.shippingCost?.toString() ?? "",
    shippingStatus: snapshot?.shipping.status ?? CostEvidenceStatuses.UNKNOWN,
    insuranceCost: calculation?.insuranceCost?.toString() ?? "",
    insuranceStatus: snapshot?.insurance.status ?? CostEvidenceStatuses.UNKNOWN,
    customsDutyRate: calculation?.customsDutyRate?.toString() ?? "",
    customsDutyStatus: snapshot?.customsDutyRate.status ?? CostEvidenceStatuses.UNKNOWN,
    vatRate: calculation?.vatRate?.toString() ?? "",
    vatStatus: snapshot?.vatRate.status ?? CostEvidenceStatuses.ESTIMATED,
    freightForwardingCost: calculation?.freightForwardingCost?.toString() ?? "",
    freightForwardingStatus: snapshot?.freightForwarding.status ?? CostEvidenceStatuses.UNKNOWN,
    storageCost: calculation?.storageCost?.toString() ?? "",
    storageStatus: snapshot?.storage.status ?? CostEvidenceStatuses.UNKNOWN,
    inspectionCost: calculation?.inspectionCost?.toString() ?? "",
    inspectionStatus: snapshot?.inspection.status ?? CostEvidenceStatuses.UNKNOWN,
    otherCosts: calculation?.otherCosts?.toString() ?? "",
    otherStatus: snapshot?.other.status ?? CostEvidenceStatuses.UNKNOWN,
    targetSellingPrice: calculation?.targetSellingPrice?.toString() ?? "",
    vatTreatment: calculation?.vatTreatment ?? snapshot?.vatTreatment ?? VatTreatments.UNSURE,
    shippingEstimate: snapshot?.shippingEstimate ?? null,
    customsProvenance: snapshot?.customsProvenance ?? null,
    needsReview: calculation?.calculationStatus === "NEEDS_REVIEW",
  };
}
