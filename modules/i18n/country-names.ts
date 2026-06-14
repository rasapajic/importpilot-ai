import { resolveLocale, type Locale } from "./translations";

const businessCountryNames: Record<string, Record<Locale, string>> = {
  RS: { en: "Serbia", de: "Serbien", sr: "Srbija" },
  // Keep legacy data readable until every environment has applied the RS migration.
  SR: { en: "Serbia", de: "Serbien", sr: "Srbija" },
};

export function normalizeTargetCountryCode(countryCode: string): string {
  const country = countryCode.trim().toUpperCase();
  return country === "SR" ? "RS" : country;
}

export function getCountryDisplayName(countryCode: string, locale: Locale | string): string {
  const country = countryCode.trim().toUpperCase();
  const resolvedLocale = resolveLocale(locale);
  const businessName = businessCountryNames[country]?.[resolvedLocale];
  if (businessName) return businessName;

  const displayNames = new Intl.DisplayNames(
    [resolvedLocale === "sr" ? "sr-Latn" : resolvedLocale],
    { type: "region" },
  );
  return displayNames.of(country) ?? country;
}
