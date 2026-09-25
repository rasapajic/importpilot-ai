import { describe, expect, it } from "vitest";

import { buildLandedCostBreakdown } from "../../modules/cost-engine/application/landed-cost-breakdown";
import { CostEvidenceStatuses, VatTreatments, isOfficialCustomsEvidenceConfirmed } from "../../modules/cost-engine/domain/cost-evidence";
import { calculateProgressiveLandedCost } from "../../modules/cost-engine/domain/progressive-calculator";
import { DEFAULT_EUR_FX_SNAPSHOT, getFxSnapshotStatus } from "../../modules/fx/euro-display";

const unknownInput = {
  targetCountry: "RS",
  quantity: 1000,
  unitPrice: "0.964",
  currency: "EUR",
  incoterm: "FOB",
  shippingCost: null,
  shippingStatus: CostEvidenceStatuses.UNKNOWN,
  insuranceCost: null,
  insuranceStatus: CostEvidenceStatuses.UNKNOWN,
  customsDutyRate: null,
  customsDutyStatus: CostEvidenceStatuses.UNKNOWN,
  vatRate: "20",
  vatStatus: CostEvidenceStatuses.ESTIMATED,
  freightForwardingCost: null,
  freightForwardingStatus: CostEvidenceStatuses.UNKNOWN,
  storageCost: null,
  storageStatus: CostEvidenceStatuses.NOT_APPLICABLE,
  inspectionCost: null,
  inspectionStatus: CostEvidenceStatuses.NOT_APPLICABLE,
  otherCosts: null,
  otherStatus: CostEvidenceStatuses.UNKNOWN,
  targetSellingPrice: "4",
  vatTreatment: VatTreatments.UNSURE,
  customsProvenance: {
    sourceName: "TARIS",
    officialUrl: "https://www.carina.rs/taris",
    checkedAt: "2026-06-14",
    tariffCode: "9004",
    originCountry: "CN",
    shippingCountry: "CN",
    confirmedByOfficialSource: false,
  },
};

describe("cost evidence and partial calculation", () => {
  it("keeps unknown mandatory inputs null and exposes only known costs", () => {
    const result = calculateProgressiveLandedCost({
      ...unknownInput,
      shippingCost: "0",
      customsDutyRate: "0",
      insuranceCost: "15",
      freightForwardingCost: "25",
      otherCosts: "5",
    });
    expect(result.shippingCost).toBeNull();
    expect(result.customsDutyRate).toBeNull();
    expect(result.insuranceCost).toBeNull();
    expect(result.freightForwardingCost).toBeNull();
    expect(result.otherCosts).toBeNull();
    expect(result.knownCostTotal).toBe("964.00");
    expect(result.landedCostTotal).toBeNull();
    expect(result.landedCostPerUnit).toBeNull();
    expect(result.grossMarginPercent).toBeNull();
  });

  it("shows a status for every breakdown line and no final total for unknown costs", () => {
    const result = calculateProgressiveLandedCost(unknownInput);
    const breakdown = buildLandedCostBreakdown({
      ...result,
      calculationStatus: "NEEDS_REVIEW",
      costEvidence: result.costEvidence,
      customsProvenance: unknownInput.customsProvenance,
    });
    expect(Object.values(breakdown.lines).map((line) => line.status)).toEqual([
      "CONFIRMED",
      "UNKNOWN",
      "UNKNOWN",
      "UNKNOWN",
      "ESTIMATED",
      "UNKNOWN",
      "NOT_APPLICABLE",
      "NOT_APPLICABLE",
      "UNKNOWN",
    ]);
    expect(breakdown.displayedTotal).toBeNull();
    expect(breakdown.totalPerUnit).toBeNull();
    expect(breakdown.knownCostTotal).toBe(964);
    expect(breakdown.customsValueStatus).toBe("UNKNOWN");
    expect(breakdown.vatBaseStatus).toBe("UNKNOWN");
  });

  it("does not confirm customs from a four-digit heading", () => {
    expect(isOfficialCustomsEvidenceConfirmed({
      ...unknownInput.customsProvenance,
      confirmedByOfficialSource: true,
    })).toBe(false);
    expect(isOfficialCustomsEvidenceConfirmed({
      ...unknownInput.customsProvenance,
      tariffCode: "90049010",
      confirmedByOfficialSource: true,
    })).toBe(true);
  });

  it("keeps a supplied duty rate unknown until the full code and official evidence are confirmed", () => {
    const result = calculateProgressiveLandedCost({
      ...unknownInput,
      shippingCost: "225",
      shippingStatus: CostEvidenceStatuses.ESTIMATED,
      customsDutyRate: "8",
      customsDutyStatus: CostEvidenceStatuses.CONFIRMED,
      shippingEstimate: {
        mode: "SEA",
        confidence: "HIGH",
        estimatedWeightKg: 300,
        estimatedVolumeCbm: 1.2,
        sizeOption: "BOOK",
        weightOption: "G_100_500",
      },
    });

    expect(result.customsDutyRate).toBeNull();
    expect(result.landedCostTotal).toBeNull();
    expect(result.costEvidence.shippingEstimate).toMatchObject({ mode: "SEA", confidence: "HIGH" });
    expect(result.costEvidence.customsProvenance?.tariffCode).toBe("9004");
  });

  it("separates required cash and deductible-VAT net acquisition cost", () => {
    const result = calculateProgressiveLandedCost({
      ...unknownInput,
      shippingCost: "100",
      shippingStatus: CostEvidenceStatuses.CONFIRMED,
      insuranceStatus: CostEvidenceStatuses.NOT_APPLICABLE,
      customsDutyRate: "5",
      customsDutyStatus: CostEvidenceStatuses.CONFIRMED,
      vatStatus: CostEvidenceStatuses.CONFIRMED,
      freightForwardingStatus: CostEvidenceStatuses.NOT_APPLICABLE,
      otherStatus: CostEvidenceStatuses.NOT_APPLICABLE,
      vatTreatment: VatTreatments.DEDUCTIBLE_INPUT_TAX,
      customsProvenance: {
        ...unknownInput.customsProvenance,
        tariffCode: "90049010",
        confirmedByOfficialSource: true,
      },
    });
    expect(result.isReliable).toBe(true);
    expect(result.requiredCashTotal).not.toBeNull();
    expect(Number(result.netAcquisitionCost)).toBeLessThan(Number(result.requiredCashTotal));
  });

  it("marks the 2026-06-14 reference FX snapshot as test and stale", () => {
    expect(getFxSnapshotStatus(DEFAULT_EUR_FX_SNAPSHOT, new Date("2026-09-25T00:00:00.000Z")))
      .toEqual({ isTest: true, stale: true, reliable: false });
  });
});
