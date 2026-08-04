import { z } from "zod";

import {
  getImportCountryProfile,
  PRIMARY_IMPORT_COUNTRY_CODES,
  type PrimaryImportCountryCode,
} from "@/modules/cost-engine/domain/import-country-profiles";

export const LANDED_COST_ASSUMPTIONS_VERSION = "LANDED_COST_ASSUMPTIONS_V2" as const;
// Compatibility export for code written during the Serbia-only prototype.
export const SERBIA_LANDED_COST_VERSION = LANDED_COST_ASSUMPTIONS_VERSION;

const decimalAmountSchema = z.string().regex(/^(0|[1-9]\d*)(\.\d{1,2})?$/);
const countryCodeSchema = z.enum(PRIMARY_IMPORT_COUNTRY_CODES);

export const vatAssumptionSourceSchema = z.enum([
  "COUNTRY_PROFILE_DEFAULT",
  "COUNTRY_DEFAULT",
  "MANUAL_OVERRIDE",
  "SERBIA_DEFAULT_20",
]);

const currentAssumptionsSchema = z.object({
  version: z.literal(LANDED_COST_ASSUMPTIONS_VERSION),
  countryCode: countryCodeSchema,
  countryProfileVersion: z.string().trim().min(1).max(80),
  chinaDomesticTransportCost: decimalAmountSchema,
  internationalTransportCost: decimalAmountSchema,
  insuranceCost: decimalAmountSchema,
  customsBrokerCost: decimalAmountSchema,
  otherCosts: decimalAmountSchema,
  transportConfirmed: z.boolean(),
  customsDutyConfirmed: z.boolean(),
  vatSource: vatAssumptionSourceSchema,
});

const legacySerbiaAssumptionsSchema = z.object({
  version: z.literal("SERBIA_LANDED_COST_V1"),
  chinaDomesticTransportCost: decimalAmountSchema,
  internationalTransportCost: decimalAmountSchema,
  insuranceCost: decimalAmountSchema,
  customsBrokerCost: decimalAmountSchema,
  otherCosts: decimalAmountSchema,
  transportConfirmed: z.boolean(),
  customsDutyConfirmed: z.boolean(),
  vatSource: vatAssumptionSourceSchema,
});

export const serbiaLandedCostAssumptionsSchema = currentAssumptionsSchema;
export type VatAssumptionSource = z.infer<typeof vatAssumptionSourceSchema>;
export type LandedCostAssumptions = z.infer<typeof currentAssumptionsSchema>;
// Compatibility alias for components already using the old name.
export type SerbiaLandedCostAssumptions = LandedCostAssumptions;

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

export function totalImportTransportCost(
  assumptions: Pick<
    LandedCostAssumptions,
    "chinaDomesticTransportCost" | "internationalTransportCost" | "insuranceCost"
  >,
) {
  return sumCostAmounts([
    assumptions.chinaDomesticTransportCost,
    assumptions.internationalTransportCost,
    assumptions.insuranceCost,
  ]);
}

export const totalSerbiaTransportCost = totalImportTransportCost;

export function requiresImportCostReview(input: {
  targetCountry: string;
  transportConfirmed: boolean;
  customsDutyConfirmed: boolean;
  vatRate?: string;
  vatSource?: VatAssumptionSource;
}) {
  const profile = getImportCountryProfile(input.targetCountry);
  if (!profile) return false;
  if (!input.transportConfirmed || !input.customsDutyConfirmed) return true;
  return input.vatSource === "COUNTRY_PROFILE_DEFAULT" &&
    input.vatRate !== undefined &&
    Number(input.vatRate) !== Number(profile.defaultVatRate);
}

export const requiresSerbiaCostReview = requiresImportCostReview;

function normalizeLegacySerbiaAssumptions(
  legacy: z.infer<typeof legacySerbiaAssumptionsSchema>,
): LandedCostAssumptions {
  const profile = getImportCountryProfile("RS");
  if (!profile) throw new Error("RS country profile is missing.");
  return {
    version: LANDED_COST_ASSUMPTIONS_VERSION,
    countryCode: "RS",
    countryProfileVersion: profile.version,
    chinaDomesticTransportCost: legacy.chinaDomesticTransportCost,
    internationalTransportCost: legacy.internationalTransportCost,
    insuranceCost: legacy.insuranceCost,
    customsBrokerCost: legacy.customsBrokerCost,
    otherCosts: legacy.otherCosts,
    transportConfirmed: legacy.transportConfirmed,
    customsDutyConfirmed: legacy.customsDutyConfirmed,
    vatSource: legacy.vatSource === "SERBIA_DEFAULT_20"
      ? "COUNTRY_PROFILE_DEFAULT"
      : legacy.vatSource,
  };
}

export function readSerbiaLandedCostAssumptions(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return null;
  const record = metadata as Record<string, unknown>;
  const current = currentAssumptionsSchema.safeParse(record.costAssumptions);
  if (current.success) return current.data;
  const legacy = legacySerbiaAssumptionsSchema.safeParse(record.costAssumptions);
  return legacy.success ? normalizeLegacySerbiaAssumptions(legacy.data) : null;
}

export const readLandedCostAssumptions = readSerbiaLandedCostAssumptions;

export function getLatestCostAssumptionsByOffer(
  activities: Array<{ type: string; metadata: unknown }>,
) {
  const assumptionsByOffer: Record<string, LandedCostAssumptions> = {};
  for (const activity of activities) {
    if (activity.type !== "LANDED_COST_CALCULATED") continue;
    if (!activity.metadata || typeof activity.metadata !== "object") continue;
    const metadata = activity.metadata as Record<string, unknown>;
    const offerId = typeof metadata.offerId === "string" ? metadata.offerId : null;
    if (!offerId || assumptionsByOffer[offerId]) continue;
    const assumptions = readLandedCostAssumptions(metadata);
    if (assumptions) assumptionsByOffer[offerId] = assumptions;
  }
  return assumptionsByOffer;
}

export function createLandedCostAssumptions(input: {
  countryCode: PrimaryImportCountryCode;
  chinaDomesticTransportCost: string;
  internationalTransportCost: string;
  insuranceCost: string;
  customsBrokerCost: string;
  otherCosts: string;
  transportConfirmed: boolean;
  customsDutyConfirmed: boolean;
  vatSource: VatAssumptionSource;
}): LandedCostAssumptions {
  const profile = getImportCountryProfile(input.countryCode);
  if (!profile) throw new Error("Country profile is missing.");
  return currentAssumptionsSchema.parse({
    version: LANDED_COST_ASSUMPTIONS_VERSION,
    countryCode: profile.countryCode,
    countryProfileVersion: profile.version,
    chinaDomesticTransportCost: input.chinaDomesticTransportCost,
    internationalTransportCost: input.internationalTransportCost,
    insuranceCost: input.insuranceCost,
    customsBrokerCost: input.customsBrokerCost,
    otherCosts: input.otherCosts,
    transportConfirmed: input.transportConfirmed,
    customsDutyConfirmed: input.customsDutyConfirmed,
    vatSource: input.vatSource,
  });
}
