import type { SupplierOfferSearchResult } from "./search";

function normalizedSpecText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function extractWattages(value: string) {
  return [...normalizedSpecText(value).matchAll(/\b(\d{2,4})\s*w(?:att(?:s)?)?\b/g)]
    .map((match) => Number(match[1]))
    .filter((number) => Number.isFinite(number));
}

function extractMeterLengths(value: string) {
  return [...normalizedSpecText(value).matchAll(
    /\b(\d+(?:[.,]\d+)?)\s*(?:m|meter|meters|metre|metres)\b/g,
  )]
    .map((match) => Number(match[1]?.replace(",", ".")))
    .filter((number) => Number.isFinite(number));
}

function normalizedConnectorText(value: string) {
  return normalizedSpecText(value)
    .replace(/[-_/+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function requestsUsbCToUsbC(value: string) {
  const text = normalizedConnectorText(value);
  return /\b(?:usb|type)\s*c\s+(?:to|2)\s+(?:usb|type)\s*c\b/.test(text);
}

function candidateMatchesUsbCToUsbC(value: string) {
  const text = normalizedConnectorText(value);
  if (/\b(?:2|3)\s*in\s*1\b/.test(text)) return false;
  if (/\b(?:micro(?:\s*usb)?|lightning)\b/.test(text)) return false;
  if (/\b(?:usb|type)\s*a\b/.test(text)) return false;
  if (/\b(?:usb|type)\s*c\s+(?:to|2)\s+(?:usb|type)\s*c\b/.test(text)) return true;
  const typeCMentions = text.match(/\b(?:usb|type)\s*c\b/g)?.length ?? 0;
  return typeCMentions >= 2;
}

export function matchesExplicitProductSpecifications(
  productQuery: string,
  result: Pick<SupplierOfferSearchResult, "title">,
) {
  const requestedWattages = extractWattages(productQuery);
  if (requestedWattages.length > 0) {
    const offeredWattages = new Set(extractWattages(result.title));
    if (!requestedWattages.some((wattage) => offeredWattages.has(wattage))) return false;
  }

  const requestedLengths = extractMeterLengths(productQuery);
  if (requestedLengths.length > 0) {
    const offeredLengths = extractMeterLengths(result.title);
    if (!requestedLengths.some((requested) =>
      offeredLengths.some((offered) => Math.abs(offered - requested) < 0.001)
    )) {
      return false;
    }
  }

  if (/\bbraid(?:ed|ing)?\b/.test(normalizedSpecText(productQuery)) &&
      !/\bbraid(?:ed|ing)?\b/.test(normalizedSpecText(result.title))) {
    return false;
  }

  if (requestsUsbCToUsbC(productQuery) && !candidateMatchesUsbCToUsbC(result.title)) {
    return false;
  }

  return true;
}
