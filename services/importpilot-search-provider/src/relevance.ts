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

  return results
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
