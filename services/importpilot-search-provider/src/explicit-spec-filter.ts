import type { SearchRequest, SupplierSearchResult } from "./contract.js";
import type { SupplierSearchOutcome, SupplierSearchSource } from "./provider.js";

export const ExplicitSpecMismatchReasons = {
  CONNECTOR: "CONNECTOR_MISMATCH",
  MULTI_HEAD: "MULTI_HEAD_MISMATCH",
  LENGTH: "LENGTH_MISMATCH",
  POWER: "POWER_BELOW_REQUEST",
} as const;

export type ExplicitSpecMismatchReason =
  (typeof ExplicitSpecMismatchReasons)[keyof typeof ExplicitSpecMismatchReasons];

type Connector = "USB_C" | "USB_A" | "MICRO_USB" | "LIGHTNING" | "DC";
type ConnectorPair = readonly [Connector, Connector];

const CONNECTOR_TERM =
  "(?:usb\\s*c|type\\s*c|usb\\s*a|type\\s*a|micro\\s*usb|lightning|dc\\s*(?:jack|plug|barrel)?|barrel\\s*(?:jack|plug)?|power\\s*jack|usb|c)";
const CONNECTOR_PAIR_PATTERN = new RegExp(
  `\\b(${CONNECTOR_TERM})\\s+(?:to|2)\\s+(${CONNECTOR_TERM})\\b`,
);
const MULTI_HEAD_PATTERN = /\b(?:2|3|4|5)\s+in\s+1\b/;

function normalizeText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function connector(value: string): Connector | null {
  const normalized = value.replace(/\s+/g, "");
  if (normalized === "usbc" || normalized === "typec" || normalized === "c") return "USB_C";
  if (normalized === "usba" || normalized === "typea" || normalized === "usb") return "USB_A";
  if (normalized === "microusb") return "MICRO_USB";
  if (normalized === "lightning") return "LIGHTNING";
  if (
    normalized === "dc" ||
    normalized.startsWith("dcjack") ||
    normalized.startsWith("dcplug") ||
    normalized.startsWith("dcbarrel") ||
    normalized.startsWith("barrel") ||
    normalized === "powerjack"
  ) return "DC";
  return null;
}

function connectorPair(value: string): ConnectorPair | null {
  const match = normalizeText(value).match(CONNECTOR_PAIR_PATTERN);
  if (!match?.[1] || !match[2]) return null;
  const from = connector(match[1]);
  const to = connector(match[2]);
  return from && to ? [from, to] : null;
}

function sameConnectorPair(left: ConnectorPair, right: ConnectorPair) {
  return left[0] === right[0] && left[1] === right[1];
}

function measurements(value: string, unitPattern: string) {
  const normalized = value.toLowerCase().replace(/,/g, ".");
  const pattern = new RegExp(`\\b(\\d+(?:\\.\\d+)?)\\s*(?:${unitPattern})\\b`, "g");
  const values: number[] = [];
  for (const match of normalized.matchAll(pattern)) {
    const parsed = Number(match[1]);
    if (Number.isFinite(parsed) && parsed > 0) values.push(parsed);
  }
  return values;
}

function requestedSingleMeasurement(query: string, unitPattern: string) {
  const values = measurements(query, unitPattern);
  return values.length === 1 ? values[0]! : null;
}

function containsMeasurement(values: number[], requested: number) {
  return values.some((value) => Math.abs(value - requested) <= 0.001);
}

function distinctMeasurements(values: number[]) {
  const distinct: number[] = [];
  for (const value of values) {
    if (!containsMeasurement(distinct, value)) distinct.push(value);
  }
  return distinct;
}

export function explicitSpecMismatchReasons(
  productQuery: string,
  result: Pick<SupplierSearchResult, "title">,
) {
  const reasons: ExplicitSpecMismatchReason[] = [];
  const queryText = normalizeText(productQuery);
  const titleText = normalizeText(result.title);

  const requestedPair = connectorPair(productQuery);
  const offeredPair = connectorPair(result.title);
  if (requestedPair && offeredPair && !sameConnectorPair(requestedPair, offeredPair)) {
    reasons.push(ExplicitSpecMismatchReasons.CONNECTOR);
  }

  if (
    requestedPair &&
    !MULTI_HEAD_PATTERN.test(queryText) &&
    MULTI_HEAD_PATTERN.test(titleText)
  ) {
    reasons.push(ExplicitSpecMismatchReasons.MULTI_HEAD);
  }

  const requestedLength = requestedSingleMeasurement(
    productQuery,
    "m|meter|meters|metre|metres",
  );
  if (requestedLength !== null) {
    const offeredLengths = distinctMeasurements(
      measurements(result.title, "m|meter|meters|metre|metres"),
    );
    // When the user explicitly requests a length, the displayed price must be
    // attributable to that exact length. If the user did not specify a length,
    // all source-grounded length variants stay eligible for comparison.
    if (
      offeredLengths.length > 1 ||
      (offeredLengths.length === 1 && !containsMeasurement(offeredLengths, requestedLength))
    ) {
      reasons.push(ExplicitSpecMismatchReasons.LENGTH);
    }
  }

  const requestedPower = requestedSingleMeasurement(productQuery, "w|watt|watts");
  if (requestedPower !== null) {
    const offeredPowers = measurements(result.title, "w|watt|watts");
    if (offeredPowers.length > 0 && Math.max(...offeredPowers) < requestedPower) {
      reasons.push(ExplicitSpecMismatchReasons.POWER);
    }
  }

  return reasons;
}

export function filterExplicitSpecMismatches(
  productQuery: string,
  results: SupplierSearchResult[],
) {
  return results.filter((result) => explicitSpecMismatchReasons(productQuery, result).length === 0);
}

function outcomeParts(outcome: SupplierSearchOutcome) {
  return Array.isArray(outcome) ? { results: outcome } : outcome;
}

/**
 * Final provider guard. Semantic sources remain trusted for multilingual
 * relevance, but explicit machine-verifiable contradictions are removed.
 * Missing or unspecified product-form details stay eligible so the UI can show
 * useful alternatives; only clear conflicts are filtered out.
 */
export function createExplicitSpecFilteringSource(
  source: SupplierSearchSource,
): SupplierSearchSource {
  return {
    name: `explicit-spec(${source.name})`,
    implemented: source.implemented,
    trustedRelevance: source.trustedRelevance,
    healthCheck: source.healthCheck
      ? (signal) => source.healthCheck!(signal)
      : undefined,
    async search(input: SearchRequest, signal: AbortSignal) {
      const outcome = outcomeParts(await source.search(input, signal));
      const results = filterExplicitSpecMismatches(input.productQuery, outcome.results);
      if (Array.isArray(outcome)) return results;
      return {
        ...outcome,
        results,
        ...(outcome.summary
          ? { summary: { ...outcome.summary, returnedResults: results.length } }
          : {}),
      };
    },
  };
}
