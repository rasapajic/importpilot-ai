export const VAT_RATES_BY_COUNTRY = {
  DE: "19",
  AT: "20",
  RS: "20",
  NL: "21",
  FR: "20",
  IT: "22",
  ES: "21",
  PL: "23",
  RO: "19",
  HU: "27",
  CZ: "21",
  SK: "20",
  SI: "22",
  HR: "25",
  BG: "20",
  GR: "24",
  BE: "21",
  PT: "23",
  IE: "23",
  DK: "25",
  SE: "25",
  FI: "24",
  EE: "22",
  LV: "21",
  LT: "21",
  LU: "17",
} as const;

export function getAutomaticVatRate(targetCountry: string): string | null {
  const country = targetCountry.trim().toUpperCase();
  return VAT_RATES_BY_COUNTRY[country as keyof typeof VAT_RATES_BY_COUNTRY] ?? null;
}

export function resolveVatRate(targetCountry: string, manualOverride?: string | null): string | null {
  if (manualOverride !== undefined && manualOverride !== null && manualOverride !== "") {
    return manualOverride;
  }
  return getAutomaticVatRate(targetCountry);
}
