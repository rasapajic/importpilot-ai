import type { SupplierOfferSearchResult } from "./search";

export const ExplicitProductSpecMismatchReasons = {
  CONNECTOR: "CONNECTOR_MISMATCH",
  MULTI_HEAD: "MULTI_HEAD_MISMATCH",
  LENGTH: "LENGTH_MISMATCH",
  POWER: "POWER_BELOW_REQUEST",
} as const;

export type ExplicitProductSpecMismatchReason =
  (typeof ExplicitProductSpecMismatchReasons)[keyof typeof ExplicitProductSpecMismatchReasons];

export type ExplicitProductSpecCompatibility = {
  compatible: boolean;
  reasons: ExplicitProductSpecMismatchReason[];
};

type Connector = "USB_C" | "USB_A" | "MICRO_USB" | "LIGHTNING";
type ConnectorPair = readonly [Connector, Connector];

const CONNECTOR_TERM =
  "(?:usb\\s*c|type\\s*c|usb\\s*a|type\\s*a|micro\\s*usb|lightning|usb|c)";
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

function requestedLengthMeters(query: string) {
  const values = measurements(query, "m|meter|meters|metre|metres");
  return values.length === 1 ? values[0]! : null;
}

function requestedPowerWatts(query: string) {
  const values = measurements(query, "w|watt|watts");
  return values.length === 1 ? values[0]! : null;
}

function containsMeasurement(values: number[], requested: number) {
  return values.some((value) => Math.abs(value - requested) <= 0.001);
}

/**
 * Conservative hard guard for explicit, machine-verifiable product specs.
 * Unknown evidence is allowed through; only a clear contradiction is rejected.
 * This prevents semantically related but incompatible variants from appearing
 * among the user's best offers without pretending that missing data is known.
 */
export function assessExplicitProductSpecCompatibility(
  productQuery: string,
  result: Pick<SupplierOfferSearchResult, "title">,
): ExplicitProductSpecCompatibility {
  const reasons: ExplicitProductSpecMismatchReason[] = [];
  const queryText = normalizeText(productQuery);
  const titleText = normalizeText(result.title);

  const requestedPair = connectorPair(productQuery);
  const offeredPair = connectorPair(result.title);
  if (requestedPair && offeredPair && !sameConnectorPair(requestedPair, offeredPair)) {
    reasons.push(ExplicitProductSpecMismatchReasons.CONNECTOR);
  }

  if (
    requestedPair &&
    !MULTI_HEAD_PATTERN.test(queryText) &&
    MULTI_HEAD_PATTERN.test(titleText)
  ) {
    reasons.push(ExplicitProductSpecMismatchReasons.MULTI_HEAD);
  }

  const requestedLength = requestedLengthMeters(productQuery);
  if (requestedLength !== null) {
    const offeredLengths = measurements(result.title, "m|meter|meters|metre|metres");
    if (offeredLengths.length > 0 && !containsMeasurement(offeredLengths, requestedLength)) {
      reasons.push(ExplicitProductSpecMismatchReasons.LENGTH);
    }
  }

  const requestedPower = requestedPowerWatts(productQuery);
  if (requestedPower !== null) {
    const offeredPowers = measurements(result.title, "w|watt|watts");
    if (offeredPowers.length > 0 && Math.max(...offeredPowers) < requestedPower) {
      reasons.push(ExplicitProductSpecMismatchReasons.POWER);
    }
  }

  return { compatible: reasons.length === 0, reasons };
}

export function filterExplicitProductSpecMismatches(
  productQuery: string,
  results: SupplierOfferSearchResult[],
) {
  return results.filter((result) =>
    assessExplicitProductSpecCompatibility(productQuery, result).compatible,
  );
}
