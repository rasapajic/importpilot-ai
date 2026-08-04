export const PRIMARY_IMPORT_COUNTRY_CODES = ["RS", "AT", "DE"] as const;

export type PrimaryImportCountryCode = (typeof PRIMARY_IMPORT_COUNTRY_CODES)[number];

export type ImportCountryProfile = {
  countryCode: PrimaryImportCountryCode;
  version: string;
  defaultVatRate: string;
};

const profiles: Record<PrimaryImportCountryCode, ImportCountryProfile> = {
  RS: {
    countryCode: "RS",
    version: "RS_IMPORT_PROFILE_V1",
    defaultVatRate: "20",
  },
  AT: {
    countryCode: "AT",
    version: "AT_IMPORT_PROFILE_V1",
    defaultVatRate: "20",
  },
  DE: {
    countryCode: "DE",
    version: "DE_IMPORT_PROFILE_V1",
    defaultVatRate: "19",
  },
};

export function getImportCountryProfile(countryCode: string): ImportCountryProfile | null {
  const normalized = countryCode.trim().toUpperCase();
  return PRIMARY_IMPORT_COUNTRY_CODES.includes(normalized as PrimaryImportCountryCode)
    ? profiles[normalized as PrimaryImportCountryCode]
    : null;
}

export function isPrimaryImportCountry(countryCode: string): countryCode is PrimaryImportCountryCode {
  return getImportCountryProfile(countryCode) !== null;
}
