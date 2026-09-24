import type { CalculationStatus } from "@prisma/client";

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
  shippingCost: NumericValue;
  customsDutyRate: NumericValue;
  customsDutyAmount: NumericValue;
  vatRate: NumericValue;
  vatAmount: NumericValue;
  storageCost: NumericValue;
  inspectionCost: NumericValue;
  otherCosts: NumericValue;
  landedCostTotal: NumericValue;
  landedCostPerUnit: NumericValue;
  calculationStatus?: CalculationStatus | string;
  customsProvenance?: CustomsProvenance | null;
  shippingEstimated?: boolean | null;
};

export type LandedCostBreakdown = {
  goodsCost: number;
  internationalShipping: number;
  insurance: number | null;
  customsValue: number;
  customsDutyRate: number;
  customsDutyAmount: number;
  vatBase: number;
  vatRate: number;
  vatAmount: number;
  freightForwarding: number;
  storageCost: number;
  otherCosts: number;
  displayedTotal: number;
  storedTotal: number;
  totalPerUnit: number;
  difference: number;
  mathematicallyConsistent: boolean;
  isConfirmed: boolean;
  pendingReasons: string[];
  assumptions: string[];
  customsProvenance: Required<CustomsProvenance>;
};

function number(value: NumericValue) {
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : 0;
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

export function buildLandedCostBreakdown(input: LandedCostBreakdownInput): LandedCostBreakdown {
  const goodsCost = roundMoney(number(input.unitPrice) * input.quantity);
  const internationalShipping = number(input.shippingCost);
  const customsDutyAmount = number(input.customsDutyAmount);
  const vatAmount = number(input.vatAmount);
  const storageCost = number(input.storageCost);
  const inspectionCost = number(input.inspectionCost);
  const otherCosts = number(input.otherCosts);
  const customsValue = roundMoney(goodsCost + internationalShipping);
  const vatBase = roundMoney(customsValue + customsDutyAmount + inspectionCost + otherCosts);
  const displayedTotal = roundMoney(
    goodsCost +
      internationalShipping +
      customsDutyAmount +
      vatAmount +
      storageCost +
      inspectionCost +
      otherCosts,
  );
  const storedTotal = number(input.landedCostTotal);
  const difference = roundMoney(displayedTotal - storedTotal);
  const provenance = normalizeProvenance(input.customsProvenance);
  const assumptions: string[] = [];
  const pendingReasons: string[] = [];

  if (input.shippingEstimated) assumptions.push("Transport je procenjen.");
  if (internationalShipping === 0) pendingReasons.push("Transport nije potvrđen.");
  if (!provenance.confirmedByOfficialSource) pendingReasons.push("Carinska stopa nije potvrđena zvaničnim izvorom.");
  if (provenance.classificationSuggested) assumptions.push("Tarifna klasifikacija je predložena i nije potvrđena.");
  if (input.calculationStatus === "NEEDS_REVIEW") pendingReasons.push("Kalkulacija je označena za proveru.");

  return {
    goodsCost,
    internationalShipping,
    insurance: null,
    customsValue,
    customsDutyRate: number(input.customsDutyRate),
    customsDutyAmount,
    vatBase,
    vatRate: number(input.vatRate),
    vatAmount,
    freightForwarding: inspectionCost,
    storageCost,
    otherCosts,
    displayedTotal,
    storedTotal,
    totalPerUnit: number(input.landedCostPerUnit),
    difference,
    mathematicallyConsistent: Math.abs(difference) <= 0.01,
    isConfirmed: pendingReasons.length === 0,
    pendingReasons,
    assumptions,
    customsProvenance: provenance,
  };
}
