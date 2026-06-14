import { CalculationStatus } from "@prisma/client";
import { z } from "zod";

const decimalString = z.string().regex(/^(0|[1-9]\d*)(\.\d+)?$/);

export const costCalculationRequestSchema = z
  .object({
    shippingCost: decimalString,
    customsDutyRate: decimalString,
    vatRate: decimalString,
    storageCost: decimalString,
    inspectionCost: decimalString,
    otherCosts: decimalString,
    targetSellingPrice: decimalString,
    calculationStatus: z
      .enum([CalculationStatus.CALCULATED, CalculationStatus.NEEDS_REVIEW])
      .default(CalculationStatus.CALCULATED),
  })
  .strict();

