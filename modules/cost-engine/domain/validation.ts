import { CalculationStatus } from "@prisma/client";
import { z } from "zod";

import { vatAssumptionSourceSchema } from "@/modules/cost-engine/domain/serbia-landed-cost";

const decimalString = z.string().regex(/^(0|[1-9]\d*)(\.\d+)?$/);
const moneyString = z.string().regex(/^(0|[1-9]\d*)(\.\d{1,2})?$/);
const optionalMoneyString = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? undefined : value),
  moneyString.optional(),
);

export const costCalculationRequestSchema = z
  .object({
    shippingCost: optionalMoneyString,
    chinaDomesticTransportCost: moneyString.default("0.00"),
    internationalTransportCost: moneyString.default("0.00"),
    insuranceCost: moneyString.default("0.00"),
    customsBrokerCost: moneyString.default("0.00"),
    customsDutyRate: decimalString,
    vatRate: decimalString,
    vatSource: vatAssumptionSourceSchema.default("COUNTRY_DEFAULT"),
    storageCost: moneyString,
    inspectionCost: moneyString,
    otherCosts: moneyString,
    targetSellingPrice: moneyString,
    transportConfirmed: z.boolean().default(false),
    customsDutyConfirmed: z.boolean().default(false),
    calculationStatus: z
      .enum([CalculationStatus.CALCULATED, CalculationStatus.NEEDS_REVIEW])
      .default(CalculationStatus.CALCULATED),
  })
  .strict();
