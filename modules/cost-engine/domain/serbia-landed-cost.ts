import { z } from "zod";

export const SERBIA_LANDED_COST_VERSION = "SERBIA_LANDED_COST_V1" as const;

const decimalAmountSchema = z.string().regex(/^(0|[1-9]\d*)(\.\d{1,2})?$/);

export const vatAssumptionSourceSchema = z.enum([
  "SERBIA_DEFAULT_20",
  "COUNTRY_DEFAULT",
  "MANUAL_OVERRIDE",
]);

export const serbiaLandedCostAssumptionsSchema = z.object({
  version: z.literal(SERBIA_LANDED_COST_VERSION),
  chinaDomesticTransportCost: decimalAmountSchema,
  internationalTransportCost: decimalAmountSchema,
  insuranceCost: decimalAmountSchema,
  customsBrokerCost: decimalAmountSchema,
  otherCosts: decimalAmountSchema,
  transportConfirmed: z.boolean(),
  customsDutyConfirmed: z.boolean(),
  vatSource: vatAssumptionSourceSchema,
});

export type VatAssumptionSource = z.infer<typeof vatAssumptionSourceSchema>;
export type SerbiaLandedCostAssumptions = z.infer<typeof serbiaLandedCostAssumptionsSchema>;

function parseAmountToCents(value: string) {
  if (!decimalAmountSchema.safeParse(value).success) {
    throw new Error("Trošak mora biti nenegativan broj sa najviše dve decimale.");
  }
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0") || "0");
}

function formatCents(value: bigint) {
  const whole = value / 100n;
  const fraction = (value % 100n).toString().padStart(2, "0");
  return `${whole}.${fraction}`;
}

export function sumCostAmounts(values: string[]) {
  return formatCents(values.reduce((total, value) => total + parseAmountToCents(value), 0n));
}

export function totalSerbiaTransportCost(
  assumptions: Pick<
    SerbiaLandedCostAssumptions,
    "chinaDomesticTransportCost" | "internationalTransportCost" | "insuranceCost"
  >,
) {
  return sumCostAmounts([
    assumptions.chinaDomesticTransportCost,
    assumptions.internationalTransportCost,
    assumptions.insuranceCost,
  ]);
}

export function requiresSerbiaCostReview(input: {
  targetCountry: string;
  transportConfirmed: boolean;
  customsDutyConfirmed: boolean;
}) {
  return input.targetCountry.trim().toUpperCase() === "RS" &&
    (!input.transportConfirmed || !input.customsDutyConfirmed);
}

export function readSerbiaLandedCostAssumptions(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return null;
  const record = metadata as Record<string, unknown>;
  const parsed = serbiaLandedCostAssumptionsSchema.safeParse(record.costAssumptions);
  return parsed.success ? parsed.data : null;
}

export function getLatestCostAssumptionsByOffer(
  activities: Array<{ type: string; metadata: unknown }>,
) {
  const assumptionsByOffer: Record<string, SerbiaLandedCostAssumptions> = {};
  for (const activity of activities) {
    if (activity.type !== "LANDED_COST_CALCULATED") continue;
    if (!activity.metadata || typeof activity.metadata !== "object") continue;
    const metadata = activity.metadata as Record<string, unknown>;
    const offerId = typeof metadata.offerId === "string" ? metadata.offerId : null;
    if (!offerId || assumptionsByOffer[offerId]) continue;
    const assumptions = readSerbiaLandedCostAssumptions(metadata);
    if (assumptions) assumptionsByOffer[offerId] = assumptions;
  }
  return assumptionsByOffer;
}
