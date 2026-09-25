import { CalculationStatus } from "@prisma/client";
import { z } from "zod";

import { CostEvidenceStatuses, VatTreatments } from "./cost-evidence";

const decimalString = z.string().regex(/^(0|[1-9]\d*)(\.\d+)?$/);
const optionalDecimalString = z.preprocess(
  (value) => value === "" || value === undefined ? null : value,
  decimalString.nullable(),
);
const evidenceStatus = z.enum([
  CostEvidenceStatuses.CONFIRMED,
  CostEvidenceStatuses.ESTIMATED,
  CostEvidenceStatuses.UNKNOWN,
  CostEvidenceStatuses.NOT_APPLICABLE,
]);

export const costCalculationRequestSchema = z
  .object({
    shippingCost: optionalDecimalString,
    shippingStatus: evidenceStatus.default(CostEvidenceStatuses.UNKNOWN),
    insuranceCost: optionalDecimalString.default(null),
    insuranceStatus: evidenceStatus.default(CostEvidenceStatuses.UNKNOWN),
    customsDutyRate: optionalDecimalString,
    customsDutyStatus: evidenceStatus.default(CostEvidenceStatuses.UNKNOWN),
    vatRate: optionalDecimalString,
    vatStatus: evidenceStatus.default(CostEvidenceStatuses.ESTIMATED),
    freightForwardingCost: optionalDecimalString.default(null),
    freightForwardingStatus: evidenceStatus.default(CostEvidenceStatuses.UNKNOWN),
    storageCost: optionalDecimalString,
    storageStatus: evidenceStatus.default(CostEvidenceStatuses.UNKNOWN),
    inspectionCost: optionalDecimalString,
    inspectionStatus: evidenceStatus.default(CostEvidenceStatuses.UNKNOWN),
    otherCosts: optionalDecimalString,
    otherStatus: evidenceStatus.default(CostEvidenceStatuses.UNKNOWN),
    targetSellingPrice: optionalDecimalString,
    vatTreatment: z.enum([
      VatTreatments.COST,
      VatTreatments.DEDUCTIBLE_INPUT_TAX,
      VatTreatments.UNSURE,
    ]).default(VatTreatments.UNSURE),
    calculationStatus: z
      .enum([CalculationStatus.CALCULATED, CalculationStatus.NEEDS_REVIEW])
      .default(CalculationStatus.CALCULATED),
  })
  .strict()
  .superRefine((value, context) => {
    const pairs = [
      ["shippingCost", "shippingStatus"],
      ["insuranceCost", "insuranceStatus"],
      ["customsDutyRate", "customsDutyStatus"],
      ["vatRate", "vatStatus"],
      ["freightForwardingCost", "freightForwardingStatus"],
      ["storageCost", "storageStatus"],
      ["inspectionCost", "inspectionStatus"],
      ["otherCosts", "otherStatus"],
    ] as const;
    for (const [valueKey, statusKey] of pairs) {
      if (
        value[statusKey] !== CostEvidenceStatuses.UNKNOWN &&
        value[statusKey] !== CostEvidenceStatuses.NOT_APPLICABLE &&
        value[valueKey] === null
      ) {
        context.addIssue({
          code: "custom",
          path: [valueKey],
          message: "Unesite vrednost ili označite stavku kao nepoznatu/neprimenljivu.",
        });
      }
    }
  });

