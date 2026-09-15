import type { SupplierSearchResult } from "./contract.js";

const ignoredTokens = new Set([
  "a",
  "an",
  "and",
  "for",
  "from",
  "in",
  "of",
  "on",
  "the",
  "to",
  "with",
  "oem",
  "supplier",
  "automatic",
  "high",
  "quality",
  "smart",
  "foldable",
  "folding",
  "collapsible",
  "expandable",
  "black",
  "white",
  "blue",
  "red",
  "green",
  "grey",
  "gray",
  "polyester",
  "fabric",
  "plastic",
  "steel",
  "metal",
  "wood",
  "wooden",
  "compartment",
  "point",
  "piece",
  "pieces",
  "unit",
  "units",
]);

const canonicalTokens: Record<string, string> = {
  automobile: "car",
  automotive: "car",
  vehicle: "car",
  vehicles: "car",
  boot: "trunk",
  cargo: "trunk",
  organiser: "organizer",
  organisers: "organizer",
  organizers: "organizer",
};

function singularize(token: string) {
  if (token.length > 4 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.length > 4 && token.endsWith("es")) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith("s")) return token.slice(0, -1);
  return token;
}

function tokens(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !/^\d+(?:\.\d+)?$/.test(token))
    .map((token) => canonicalTokens[token] ?? singularize(token))
    .map((token) => canonicalTokens[token] ?? token);
}

export function coreProductTokens(query: string) {
  return [...new Set(tokens(query).filter((token) => !ignoredTokens.has(token)))];
}

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

function matchesExplicitSpecifications(productQuery: string, title: string) {
  const requestedWattages = extractWattages(productQuery);
  if (requestedWattages.length > 0) {
    const offeredWattages = new Set(extractWattages(title));
    if (!requestedWattages.some((wattage) => offeredWattages.has(wattage))) return false;
  }

  const requestedLengths = extractMeterLengths(productQuery);
  if (requestedLengths.length > 0) {
    const offeredLengths = extractMeterLengths(title);
    if (!requestedLengths.some((requested) =>
      offeredLengths.some((offered) => Math.abs(offered - requested) < 0.001)
    )) {
      return false;
    }
  }

  if (/\bbraid(?:ed|ing)?\b/.test(normalizedSpecText(productQuery)) &&
      !/\bbraid(?:ed|ing)?\b/.test(normalizedSpecText(title))) {
    return false;
  }

  if (requestsUsbCToUsbC(productQuery) && !candidateMatchesUsbCToUsbC(title)) {
    return false;
  }

  return true;
}

/**
 * Enforces only specifications that are explicit and mechanically verifiable
 * from the listing title. Semantic providers remain trusted for product meaning,
 * but they may not override a direct contradiction such as 1.5 m vs 1 m,
 * a missing requested wattage, or a multi-connector cable when C-to-C was asked.
 */
export function filterHardSpecificationMatches(
  productQuery: string,
  results: SupplierSearchResult[],
) {
  return results.filter((result) => matchesExplicitSpecifications(productQuery, result.title));
}

function relevanceScore(queryTokens: string[], title: string) {
  const titleTokens = tokens(title);
  const titleSet = new Set(titleTokens);
  const matched = queryTokens.filter((token) => titleSet.has(token));
  let adjacentMatches = 0;

  for (let index = 0; index < queryTokens.length - 1; index += 1) {
    const first = queryTokens[index];
    const second = queryTokens[index + 1];
    for (let titleIndex = 0; titleIndex < titleTokens.length - 1; titleIndex += 1) {
      if (titleTokens[titleIndex] === first && titleTokens[titleIndex + 1] === second) {
        adjacentMatches += 1;
        break;
      }
    }
  }

  return {
    matchedCount: matched.length,
    score: matched.length * 10 + adjacentMatches * 4,
  };
}

export function rankRelevantSupplierResults(
  productQuery: string,
  results: SupplierSearchResult[],
  limit = 5,
) {
  const queryTokens = coreProductTokens(productQuery);
  const strict = queryTokens.length >= 3;
  const requiredMatches = strict
    ? Math.max(2, Math.ceil(queryTokens.length * 0.5))
    : 0;
  const hardMatchedResults = filterHardSpecificationMatches(productQuery, results);

  return hardMatchedResults
    .map((result, index) => ({
      result,
      index,
      ...relevanceScore(queryTokens, result.title),
    }))
    .filter((candidate) => !strict || candidate.matchedCount >= requiredMatches)
    .sort((left, right) =>
      right.score - left.score || left.index - right.index,
    )
    .slice(0, limit)
    .map((candidate) => candidate.result);
}
