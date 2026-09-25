import type { CalculationStatus } from "@prisma/client";

import {
  CostEvidenceStatuses,
  isOfficialCustomsEvidenceConfirmed,
  VatTreatments,
  type CostEvidenceSnapshot,
  type CostEvidenceStatus,
  type VatTreatment,
} from "../domain/cost-evidence";

type NumericValue = number | string | { toString(): string };

export type CustomsProvenance = {
  sourceName?: string | null;
  officialUrl?: string | null;
  checkedAt?: string | null;
  validFrom?: string | null;
  tariffCode?: string | null;
  originCountry?: string | null;
  shippingCountry?: string | null;
  rateType?: "standard" | "preferential" | "unknown" | null;
  confirmedByOfficialSource?: boolean | null;
  classificationSuggested?: boolean | null;
};

export type LandedCostBreakdownInput = {
  unitPrice: NumericValue;
  quantity: number;
  currency: string;
  shippingCost: NumericValue | null;
  insuranceCost?: NumericValue | null;
  customsDutyRate: NumericValue | null;
  customsDutyAmount: NumericValue | null;
  vatRate: NumericValue | null;
  vatAmount: NumericValue | null;
  freightForwardingCost?: NumericValue | null;
  storageCost: NumericValue | null;
  inspectionCost: NumericValue | null;
  otherCosts: NumericValue | null;
  knownCostTotal?: NumericValue | null;
  landedCostTotal: NumericValue | null;
  landedCostPerUnit: NumericValue | null;
  calculationStatus?: CalculationStatus | string;
  customsProvenance?: CustomsProvenance | null;
  shippingEstimated?: boolean | null;
  costEvidence?: unknown;
  vatTreatment?: string | null;
  requiredCashTotal?: NumericValue | null;
  netAcquisitionCost?: NumericValue | null;
};

export type BreakdownLine = {
  value: number | null;
  status: CostEvidenceStatus;
};

export type LandedCostBreakdown = {
  goodsCost: number;
  internationalShipping: number | null;
  insurance: number | null;
  customsValue: number | null;
  customsValueStatus: CostEvidenceStatus;
  customsDutyRate: number | null;
  customsDutyAmount: number | null;
  vatBase: number | null;
  vatBaseStatus: CostEvidenceStatus;
  vatRate: number | null;
  vatAmount: number | null;
  freightForwarding: number | null;
  storageCost: number | null;
  inspectionCost: number | null;
  otherCosts: number | null;
  knownCostTotal: number;
  displayedTotal: number | null;
  storedTotal: number | null;
  totalPerUnit: number | null;
  requiredCashTotal: number | null;
  netAcquisitionCost: number | null;
  vatTreatment: VatTreatment;
  difference: number | null;
  mathematicallyConsistent: boolean;
  isConfirmed: boolean;
  pendingReasons: string[];
  assumptions: string[];
  customsProvenance: Required<CustomsProvenance>;
  lines: Record<
    "goods" | "shipping" | "insurance" | "customsDuty" | "vat" | "freightForwarding" | "storage" | "inspection" | "other",
    BreakdownLine
  >;
};

function nullableNumber(value: NumericValue | null | undefined) {
  if (value === null || value === undefined) return null;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : null;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeProvenance(provenance?: CustomsProvenance | null): Required<CustomsProvenance> {
  return {
    sourceName: provenance?.sourceName ?? null,
    officialUrl: provenance?.officialUrl ?? null,
    checkedAt: provenance?.checkedAt ?? null,
    validFrom: provenance?.validFrom ?? null,
    tariffCode: provenance?.tariffCode ?? null,
    originCountry: provenance?.originCountry ?? null,
    shippingCountry: provenance?.shippingCountry ?? null,
    rateType: provenance?.rateType ?? "unknown",
    confirmedByOfficialSource: provenance?.confirmedByOfficialSource ?? false,
    classificationSuggested: provenance?.classificationSuggested ?? false,
  };
}

function parseEvidence(value: unknown): CostEvidenceSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<CostEvidenceSnapshot>;
  const keys = ["goods", "shipping", "insurance", "customsDutyRate", "vatRate", "freightForwarding", "storage", "inspection", "other"] as const;
  if (!keys.every((key) => candidate[key] && typeof candidate[key] === "object")) return null;
  return candidate as CostEvidenceSnapshot;
}

function legacyStatus(
  value: number | null,
  options: { estimated?: boolean; zeroIsUnknown?: boolean } = {},
): CostEvidenceStatus {
  if (value === null) return CostEvidenceStatuses.UNKNOWN;
  if (options.zeroIsUnknown && value === 0) return CostEvidenceStatuses.UNKNOWN;
  if (options.estimated) return CostEvidenceStatuses.ESTIMATED;
  return value === 0 ? CostEvidenceStatuses.NOT_APPLICABLE : CostEvidenceStatuses.CONFIRMED;
}

function line(value: number | null, status: CostEvidenceStatus): BreakdownLine {
  return {
    value: status === CostEvidenceStatuses.UNKNOWN || status === CostEvidenceStatuses.NOT_APPLICABLE
      ? null
      : value,
    status,
  };
}

function derivedStatus(statuses: CostEvidenceStatus[]): CostEvidenceStatus {
  if (statuses.includes(CostEvidenceStatuses.UNKNOWN)) return CostEvidenceStatuses.UNKNOWN;
  if (statuses.includes(CostEvidenceStatuses.ESTIMATED)) return CostEvidenceStatuses.ESTIMATED;
  return CostEvidenceStatuses.CONFIRMED;
}

export function buildLandedCostBreakdown(input: LandedCostBreakdownInput): LandedCostBreakdown {
  const goodsCost = roundMoney((nullableNumber(input.unitPrice) ?? 0) * input.quantity);
  const shipping = nullableNumber(input.shippingCost);
  const insurance = nullableNumber(input.insuranceCost);
  const customsDutyRate = nullableNumber(input.customsDutyRate);
  const customsDutyAmount = nullableNumber(input.customsDutyAmount);
  const vatRate = nullableNumber(input.vatRate);
  const vatAmount = nullableNumber(input.vatAmount);
  const freightForwarding = nullableNumber(input.freightForwardingCost);
  const storageCost = nullableNumber(input.storageCost);
  const inspectionCost = nullableNumber(input.inspectionCost);
  const otherCosts = nullableNumber(input.otherCosts);
  const evidence = parseEvidence(input.costEvidence);
  const provenance = normalizeProvenance(input.customsProvenance);
  const officialCustoms = isOfficialCustomsEvidenceConfirmed(provenance);
  const lines = {
    goods: line(goodsCost, evidence?.goods.status ?? CostEvidenceStatuses.CONFIRMED),
    shipping: line(shipping, evidence?.shipping.status ?? legacyStatus(shipping, { estimated: Boolean(input.shippingEstimated), zeroIsUnknown: true })),
    insurance: line(insurance, evidence?.insurance.status ?? CostEvidenceStatuses.UNKNOWN),
    customsDuty: line(customsDutyAmount, evidence?.customsDutyRate.status ?? (officialCustoms ? CostEvidenceStatuses.CONFIRMED : customsDutyRate === null ? CostEvidenceStatuses.UNKNOWN : CostEvidenceStatuses.ESTIMATED)),
    vat: line(vatAmount, evidence?.vatRate.status ?? legacyStatus(vatRate)),
    freightForwarding: line(freightForwarding, evidence?.freightForwarding.status ?? CostEvidenceStatuses.UNKNOWN),
    storage: line(storageCost, evidence?.storage.status ?? legacyStatus(storageCost)),
    inspection: line(inspectionCost, evidence?.inspection.status ?? legacyStatus(inspectionCost)),
    other: line(otherCosts, evidence?.other.status ?? CostEvidenceStatuses.UNKNOWN),
  };
  const customsValue = shipping === null || insurance === null
    ? null
    : roundMoney(goodsCost + shipping + insurance);
  const vatBase = customsValue === null || customsDutyAmount === null || freightForwarding === null || inspectionCost === null || otherCosts === null
    ? null
    : roundMoney(customsValue + customsDutyAmount + freightForwarding + inspectionCost + otherCosts);
  const customsValueStatus = derivedStatus([
    lines.goods.status,
    lines.shipping.status,
    lines.insurance.status,
  ]);
  const vatBaseStatus = derivedStatus([
    customsValueStatus,
    lines.customsDuty.status,
    lines.freightForwarding.status,
    lines.inspection.status,
    lines.other.status,
  ]);
  const storedTotal = nullableNumber(input.landedCostTotal);
  const displayedTotal = storedTotal;
  const knownFromInput = nullableNumber(input.knownCostTotal);
  const knownCostTotal = knownFromInput ?? roundMoney(
    goodsCost + Object.entries(lines)
      .filter(([key]) => key !== "goods")
      .reduce((sum, [, item]) => sum + (item.value ?? 0), 0),
  );
  const pendingReasons: string[] = [];
  const assumptions: string[] = [];
  const statuses = Object.values(lines).map((item) => item.status);

  if (lines.shipping.status === CostEvidenceStatuses.UNKNOWN) pendingReasons.push("Transport nije potvrđen.");
  if (lines.insurance.status === CostEvidenceStatuses.UNKNOWN) pendingReasons.push("Osiguranje nije poznato.");
  if (!officialCustoms) pendingReasons.push("Carinska stopa nije potvrđena zvaničnim izvorom.");
  if (lines.freightForwarding.status === CostEvidenceStatuses.UNKNOWN) pendingReasons.push("Trošak špedicije nije poznat.");
  if (lines.other.status === CostEvidenceStatuses.UNKNOWN) pendingReasons.push("Ostali obavezni troškovi nisu potvrđeni.");
  if (statuses.includes(CostEvidenceStatuses.ESTIMATED)) assumptions.push("Obračun sadrži procenjene stavke.");
  if (provenance.classificationSuggested) assumptions.push("Tarifna klasifikacija je predložena i nije potvrđena.");
  if (input.calculationStatus === "NEEDS_REVIEW") pendingReasons.push("Kalkulacija je označena za proveru.");

  const isConfirmed = pendingReasons.length === 0 && statuses.every((status) =>
    status === CostEvidenceStatuses.CONFIRMED || status === CostEvidenceStatuses.NOT_APPLICABLE,
  );
  const difference = displayedTotal === null ? null : roundMoney(knownCostTotal - displayedTotal);
  const vatTreatment = Object.values(VatTreatments).includes(input.vatTreatment as VatTreatment)
    ? input.vatTreatment as VatTreatment
    : evidence?.vatTreatment ?? VatTreatments.UNSURE;

  return {
    goodsCost,
    internationalShipping: lines.shipping.value,
    insurance: lines.insurance.value,
    customsValue,
    customsValueStatus,
    customsDutyRate: lines.customsDuty.status === CostEvidenceStatuses.UNKNOWN ? null : customsDutyRate,
    customsDutyAmount: lines.customsDuty.value,
    vatBase,
    vatBaseStatus,
    vatRate: lines.vat.status === CostEvidenceStatuses.UNKNOWN ? null : vatRate,
    vatAmount: lines.vat.value,
    freightForwarding: lines.freightForwarding.value,
    storageCost: lines.storage.value,
    inspectionCost: lines.inspection.value,
    otherCosts: lines.other.value,
    knownCostTotal,
    displayedTotal,
    storedTotal,
    totalPerUnit: nullableNumber(input.landedCostPerUnit),
    requiredCashTotal: nullableNumber(input.requiredCashTotal),
    netAcquisitionCost: nullableNumber(input.netAcquisitionCost),
    vatTreatment,
    difference,
    mathematicallyConsistent: difference !== null && Math.abs(difference) <= 0.01,
    isConfirmed,
    pendingReasons: [...new Set(pendingReasons)],
    assumptions,
    customsProvenance: provenance,
    lines,
  };
}
