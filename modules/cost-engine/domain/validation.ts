import { CalculationStatus } from "@prisma/client";
import { z } from "zod";

import { vatAssumptionSourceSchema } from "@/modules/cost-engine/domain/serbia-landed-cost";

const decimalString = z.string().regex(/^(0|[1-9]\d*)(\.\d+)?$/);
const optionalDecimalString = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? undefined : value),
  decimalString.optional(),
);

export const costCalculationRequestSchema = z
  .object({
    shippingCost: optionalDecimalString,
    chinaDomesticTransportCost: decimalString.default("0.00"),
    internationalTransportCost: decimalString.default("0.00"),
    insuranceCost: decimalString.default("0.00"),
    customsBrokerCost: decimalString.default("0.00"),
    customsDutyRate: decimalString,
    vatRate: decimalString,
    vatSource: vatAssumptionSourceSchema.default("COUNTRY_DEFAULT"),
    storageCost: decimalString,
    inspectionCost: decimalString,
    otherCosts: decimalString,
    targetSellingPrice: decimalString,
    transportConfirmed: z.boolean().default(false),
    customsDutyConfirmed: z.boolean().default(false),
    calculationStatus: z
      .enum([CalculationStatus.CALCULATED, CalculationStatus.NEEDS_REVIEW])
      .default(CalculationStatus.CALCULATED),
  })
  .strict();
