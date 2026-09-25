import type { CustomsProvenance } from "../application/landed-cost-breakdown";

export const CostEvidenceStatuses = {
  CONFIRMED: "CONFIRMED",
  ESTIMATED: "ESTIMATED",
  UNKNOWN: "UNKNOWN",
  NOT_APPLICABLE: "NOT_APPLICABLE",
} as const;

export type CostEvidenceStatus =
  (typeof CostEvidenceStatuses)[keyof typeof CostEvidenceStatuses];

export const VatTreatments = {
  COST: "COST",
  DEDUCTIBLE_INPUT_TAX: "DEDUCTIBLE_INPUT_TAX",
  UNSURE: "UNSURE",
} as const;

export type VatTreatment = (typeof VatTreatments)[keyof typeof VatTreatments];

export type CostComponentEvidence = {
  status: CostEvidenceStatus;
  value: string | null;
};

export type CostEvidenceSnapshot = {
  goods: CostComponentEvidence;
  shipping: CostComponentEvidence;
  insurance: CostComponentEvidence;
  customsDutyRate: CostComponentEvidence;
  vatRate: CostComponentEvidence;
  freightForwarding: CostComponentEvidence;
  storage: CostComponentEvidence;
  inspection: CostComponentEvidence;
  other: CostComponentEvidence;
  vatTreatment: VatTreatment;
};

export function tariffCodeHasDecisionPrecision(value?: string | null) {
  const digits = value?.replace(/\D/g, "") ?? "";
  return digits.length >= 6;
}

export function isOfficialCustomsEvidenceConfirmed(
  provenance?: CustomsProvenance | null,
) {
  if (!provenance?.confirmedByOfficialSource) return false;
  if (!provenance.sourceName?.trim() || !provenance.checkedAt?.trim()) return false;
  if (!provenance.originCountry?.trim() || !provenance.shippingCountry?.trim()) return false;
  if (!tariffCodeHasDecisionPrecision(provenance.tariffCode)) return false;

  try {
    return new URL(provenance.officialUrl ?? "").protocol === "https:";
  } catch {
    return false;
  }
}
