export const LANDED_COST_1_0_INCOTERMS = ["EXW", "FCA", "FAS", "FOB"] as const;

export type LandedCost10Incoterm = (typeof LANDED_COST_1_0_INCOTERMS)[number];

export function isSupportedLandedCostIncoterm(
  value: string | null | undefined,
): value is LandedCost10Incoterm {
  return Boolean(
    value &&
    (LANDED_COST_1_0_INCOTERMS as readonly string[]).includes(value.trim().toUpperCase()),
  );
}
