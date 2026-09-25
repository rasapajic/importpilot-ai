import { calculateLandedCost } from "./calculator";
import {
  CostEvidenceStatuses,
  isOfficialCustomsEvidenceConfirmed,
  VatTreatments,
  type CostEvidenceSnapshot,
  type CostEvidenceStatus,
  type VatTreatment,
} from "./cost-evidence";
import type { CustomsProvenance } from "../application/landed-cost-breakdown";

export type ProgressiveCostInput = {
  targetCountry: string;
  quantity: number;
  unitPrice: string;
  currency: string;
  incoterm: string;
  shippingCost: string | null;
  shippingStatus: CostEvidenceStatus;
  insuranceCost: string | null;
  insuranceStatus: CostEvidenceStatus;
  customsDutyRate: string | null;
  customsDutyStatus: CostEvidenceStatus;
  vatRate: string | null;
  vatStatus: CostEvidenceStatus;
  freightForwardingCost: string | null;
  freightForwardingStatus: CostEvidenceStatus;
  storageCost: string | null;
  storageStatus: CostEvidenceStatus;
  inspectionCost: string | null;
  inspectionStatus: CostEvidenceStatus;
  otherCosts: string | null;
  otherStatus: CostEvidenceStatus;
  targetSellingPrice: string | null;
  vatTreatment: VatTreatment;
  customsProvenance?: CustomsProvenance | null;
};

function normalizedValue(value: string | null, status: CostEvidenceStatus) {
  if (status === CostEvidenceStatuses.NOT_APPLICABLE) return "0";
  return value;
}

function evidence(value: string | null, status: CostEvidenceStatus) {
  return {
    status,
    value: status === CostEvidenceStatuses.UNKNOWN || status === CostEvidenceStatuses.NOT_APPLICABLE
      ? null
      : value,
  };
}

function money(value: number) {
  return (Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2);
}

function finite(value: string | null) {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function calculateProgressiveLandedCost(input: ProgressiveCostInput) {
  const customsStatus = input.customsDutyStatus === CostEvidenceStatuses.CONFIRMED &&
    !isOfficialCustomsEvidenceConfirmed(input.customsProvenance)
    ? CostEvidenceStatuses.ESTIMATED
    : input.customsDutyStatus;
  const snapshot: CostEvidenceSnapshot = {
    goods: evidence(input.unitPrice, CostEvidenceStatuses.CONFIRMED),
    shipping: evidence(input.shippingCost, input.shippingStatus),
    insurance: evidence(input.insuranceCost, input.insuranceStatus),
    customsDutyRate: evidence(input.customsDutyRate, customsStatus),
    vatRate: evidence(input.vatRate, input.vatStatus),
    freightForwarding: evidence(input.freightForwardingCost, input.freightForwardingStatus),
    storage: evidence(input.storageCost, input.storageStatus),
    inspection: evidence(input.inspectionCost, input.inspectionStatus),
    other: evidence(input.otherCosts, input.otherStatus),
    vatTreatment: input.vatTreatment,
  };
  const monetaryComponents = [
    snapshot.shipping,
    snapshot.insurance,
    snapshot.customsDutyRate,
    snapshot.vatRate,
    snapshot.freightForwarding,
    snapshot.storage,
    snapshot.inspection,
    snapshot.other,
  ];
  const complete = monetaryComponents.every((component) =>
    component.status === CostEvidenceStatuses.NOT_APPLICABLE || component.value !== null,
  );
  const reliable = complete && monetaryComponents.every((component) =>
    component.status === CostEvidenceStatuses.CONFIRMED ||
      component.status === CostEvidenceStatuses.NOT_APPLICABLE,
  );
  const goodsCost = Number(input.unitPrice) * input.quantity;
  const knownDirectCosts = [
    snapshot.shipping,
    snapshot.insurance,
    snapshot.freightForwarding,
    snapshot.storage,
    snapshot.inspection,
    snapshot.other,
  ].reduce((sum, component) => sum + (finite(component.value) ?? 0), 0);

  if (!complete) {
    return {
      ...input,
      shippingCost: snapshot.shipping.value,
      insuranceCost: snapshot.insurance.value,
      customsDutyRate: snapshot.customsDutyRate.value,
      customsDutyAmount: null,
      vatRate: snapshot.vatRate.value,
      vatAmount: null,
      freightForwardingCost: snapshot.freightForwarding.value,
      storageCost: snapshot.storage.value,
      inspectionCost: snapshot.inspection.value,
      otherCosts: snapshot.other.value,
      knownCostTotal: money(goodsCost + knownDirectCosts),
      landedCostTotal: null,
      landedCostPerUnit: null,
      grossMarginPercent: null,
      breakEvenPrice: null,
      requiredCashTotal: null,
      netAcquisitionCost: null,
      costEvidence: snapshot,
      isComplete: false,
      isReliable: false,
    };
  }

  const completeResult = calculateLandedCost({
    targetCountry: input.targetCountry,
    quantity: input.quantity,
    unitPrice: input.unitPrice,
    currency: input.currency,
    incoterm: input.incoterm,
    shippingCost: normalizedValue(input.shippingCost, input.shippingStatus)!,
    insuranceCost: normalizedValue(input.insuranceCost, input.insuranceStatus)!,
    customsDutyRate: normalizedValue(input.customsDutyRate, customsStatus)!,
    vatRate: normalizedValue(input.vatRate, input.vatStatus)!,
    freightForwardingCost: normalizedValue(
      input.freightForwardingCost,
      input.freightForwardingStatus,
    )!,
    storageCost: normalizedValue(input.storageCost, input.storageStatus)!,
    inspectionCost: normalizedValue(input.inspectionCost, input.inspectionStatus)!,
    otherCosts: normalizedValue(input.otherCosts, input.otherStatus)!,
    targetSellingPrice: input.targetSellingPrice ?? "0.01",
  });
  const requiredCashTotal = completeResult.landedCostTotal;
  const netAcquisitionCost = input.vatTreatment === VatTreatments.UNSURE
    ? null
    : input.vatTreatment === VatTreatments.DEDUCTIBLE_INPUT_TAX
      ? money(Number(requiredCashTotal) - Number(completeResult.vatAmount))
      : requiredCashTotal;

  return {
    ...completeResult,
    targetSellingPrice: input.targetSellingPrice,
    grossMarginPercent: reliable && input.targetSellingPrice
      ? completeResult.grossMarginPercent
      : null,
    breakEvenPrice: reliable ? completeResult.breakEvenPrice : null,
    knownCostTotal: requiredCashTotal,
    landedCostTotal: requiredCashTotal,
    landedCostPerUnit: completeResult.landedCostPerUnit,
    requiredCashTotal,
    netAcquisitionCost,
    costEvidence: snapshot,
    isComplete: true,
    isReliable: reliable,
  };
}
