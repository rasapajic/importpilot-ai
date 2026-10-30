import { marketplaceDetailsEvidenceText } from "./marketplace-product-details";
import type { SupplierOfferSearchResult } from "./search";

export const ExplicitProductConstraintStatuses = {
  NOT_APPLICABLE: "NOT_APPLICABLE",
  COMPATIBLE: "COMPATIBLE",
  NEEDS_CONFIRMATION: "NEEDS_CONFIRMATION",
  DISQUALIFIED: "DISQUALIFIED",
} as const;

export type ExplicitProductConstraintStatus =
  (typeof ExplicitProductConstraintStatuses)[keyof typeof ExplicitProductConstraintStatuses];

export const ExplicitProductConstraintReasons = {
  PROGRESSIVE_OR_ADJUSTABLE_LENS: "PROGRESSIVE_OR_ADJUSTABLE_LENS",
  DIOPTER_OUTSIDE_REQUEST: "DIOPTER_OUTSIDE_REQUEST",
  LENS_TYPE_UNCONFIRMED: "LENS_TYPE_UNCONFIRMED",
  FIXED_LENS_CONFIRMED: "FIXED_LENS_CONFIRMED",
} as const;

export type ExplicitProductConstraintReason =
  (typeof ExplicitProductConstraintReasons)[keyof typeof ExplicitProductConstraintReasons];

export type ExplicitProductConstraintAssessment = {
  status: ExplicitProductConstraintStatus;
  reasons: ExplicitProductConstraintReason[];
  scoreAdjustment: number;
};

const STATUS_PRIORITY: Record<ExplicitProductConstraintStatus, number> = {
  DISQUALIFIED: 3,
  NEEDS_CONFIRMATION: 2,
  COMPATIBLE: 1,
  NOT_APPLICABLE: 0,
};

const SERBIAN_CYRILLIC_TO_LATIN: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  ђ: "dj",
  е: "e",
  ж: "z",
  з: "z",
  и: "i",
  ј: "j",
  к: "k",
  л: "l",
  љ: "lj",
  м: "m",
  н: "n",
  њ: "nj",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  ћ: "c",
  у: "u",
  ф: "f",
  х: "h",
  ц: "c",
  ч: "c",
  џ: "dz",
  ш: "s",
};

function transliterateSerbianCyrillic(value: string) {
  return [...value].map((char) => SERBIAN_CYRILLIC_TO_LATIN[char.toLowerCase()] ?? char).join("");
}

const READING_GLASSES_QUERY =
  /\b(?:reading\s+glass\w*|readers|presbyopia|lesebrillen?|naocare\s+za\s+citanje|stakla\s+za\s+citanje)\b/;
const OPTICAL_PRODUCT =
  /\b(?:glass\w*|naocar\w*|brille\w*|sociv\w*|lens(?:es)?)\b/;
const FIXED_LENS =
  /\b(?:non[-\s]?progressive|not\s+progressive|without\s+progressive|no\s+progressive|fixed[-\s]?(?:diopter|dioptre|power|strength)|single[-\s]?vision|fiksn\w*\s+dioptr\w*|nije\s+progresiv\w*|nisu\s+progresiv\w*|bez\s+progresiv\w*|ne\s+progresiv\w*|nicht\s+progressiv\w*|ohne\s+gleitsicht|feste[rn]?\s+dioptr\w*|einstaerken|einstarken)\b/;
const LENS_CONFLICT_TERM =
  /\b(?:progressive|multifocal|multi[-\s]?focal|bifocal|bi[-\s]?focal|trifocal|gleitsicht|progresiv\w*|multifokal\w*|bifokal\w*)\b/;
const NEGATED_LENS_PREFIX =
  /(?:^|\s)(?:non[-\s]?|not\s+|without\s+|no\s+|bez\s+|nije\s+|nisu\s+|ne\s+|nicht\s+|ohne\s+)$/;
const ADJUSTABLE_FOCUS =
  /\badjustable\b.{0,24}\b(?:diopter|dioptre|focus|lens|power|reading)\b|\b(?:diopter|dioptre|focus|lens|power)\b.{0,24}\badjustable\b|\badjustable\b.{0,16}\+\s*\d|\b(?:podesiv\w*|verstellbar\w*)\b.{0,24}\b(?:dioptr\w*|sociv\w*|fokus|lens|reading)|(?:\+\s*\d.{0,16})\b(?:podesiv\w*|verstellbar\w*)\b/;

function hasConflictingLens(text: string) {
  const pattern = new RegExp(LENS_CONFLICT_TERM.source, "g");
  for (const match of text.matchAll(pattern)) {
    const prefix = text.slice(Math.max(0, match.index - 16), match.index);
    if (!NEGATED_LENS_PREFIX.test(prefix)) return true;
  }
  return ADJUSTABLE_FOCUS.test(text);
}

function normalize(value: string) {
  return transliterateSerbianCyrillic(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9+.\s-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function diopterValue(raw: string) {
  const parsed = Number(raw.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0.25 || parsed > 8) return null;
  return Math.round(parsed * 100) / 100;
}

function diopterValues(text: string) {
  const values: number[] = [];
  const patterns = [
    /\+\s*(\d+(?:[.,]\d+)?)/g,
    /(\d+(?:[.,]\d+)?)\s*(?:dpt|diopter|dioptre|dioptr\w*)/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const value = diopterValue(match[1] ?? "");
      if (value !== null && !values.some((existing) => Math.abs(existing - value) < 0.001)) {
        values.push(value);
      }
    }
  }
  return values.sort((left, right) => left - right);
}

function isReadingGlassesRequest(query: string) {
  if (READING_GLASSES_QUERY.test(query)) return true;
  return diopterValues(query).length > 0 && OPTICAL_PRODUCT.test(query);
}

function dioptersConflict(requested: number[], offered: number[]) {
  if (requested.length === 0 || offered.length === 0) return false;
  const minimum = requested[0]!;
  const maximum = requested[requested.length - 1]!;
  return offered.every((value) => value < minimum - 0.001 || value > maximum + 0.001);
}

function assessment(
  status: ExplicitProductConstraintStatus,
  reasons: ExplicitProductConstraintReason[],
): ExplicitProductConstraintAssessment {
  return {
    status,
    reasons,
    scoreAdjustment: status === ExplicitProductConstraintStatuses.DISQUALIFIED ? -40 : 0,
  };
}

/**
 * Checks explicit reading-glass constraints against source text.
 * A progressive, multifocal, bifocal, or adjustable-focus listing is a hard
 * conflict only when the request itself excludes that lens type, or when every
 * stated diopter falls outside the requested range. A listing that does not
 * prove a fixed lens stays unconfirmed and must not be called compatible.
 */
export function evaluateExplicitProductConstraints(
  productQuery: string,
  result: Pick<SupplierOfferSearchResult, "title" | "marketplaceDetails">,
): ExplicitProductConstraintAssessment {
  const query = normalize(productQuery);
  if (!isReadingGlassesRequest(query)) {
    return assessment(ExplicitProductConstraintStatuses.NOT_APPLICABLE, []);
  }

  const evidence = normalize(
    marketplaceDetailsEvidenceText(result.title, result.marketplaceDetails),
  );
  const reasons: ExplicitProductConstraintReason[] = [];
  const requestExcludesVariableLens = FIXED_LENS.test(query);
  const offerConflicts = hasConflictingLens(evidence);
  const offerConfirmsFixedLens = FIXED_LENS.test(evidence) && !offerConflicts;
  const outsideRange = dioptersConflict(diopterValues(query), diopterValues(evidence));

  if (outsideRange) reasons.push(ExplicitProductConstraintReasons.DIOPTER_OUTSIDE_REQUEST);
  if ((requestExcludesVariableLens || outsideRange) && offerConflicts) {
    reasons.push(ExplicitProductConstraintReasons.PROGRESSIVE_OR_ADJUSTABLE_LENS);
  }

  if (reasons.length > 0) {
    return assessment(ExplicitProductConstraintStatuses.DISQUALIFIED, reasons);
  }
  if (offerConfirmsFixedLens) {
    return assessment(ExplicitProductConstraintStatuses.COMPATIBLE, [
      ExplicitProductConstraintReasons.FIXED_LENS_CONFIRMED,
    ]);
  }
  return assessment(ExplicitProductConstraintStatuses.NEEDS_CONFIRMATION, [
    ExplicitProductConstraintReasons.LENS_TYPE_UNCONFIRMED,
  ]);
}

export function evaluateExplicitProductConstraintsForQueries(
  queries: readonly string[],
  result: Pick<SupplierOfferSearchResult, "title" | "marketplaceDetails">,
) {
  const usable = queries.map((query) => query.trim()).filter((query) => query.length > 0);
  if (usable.length === 0) {
    return assessment(ExplicitProductConstraintStatuses.NOT_APPLICABLE, []);
  }
  return usable
    .map((query) => evaluateExplicitProductConstraints(query, result))
    .reduce((strictest, current) =>
      STATUS_PRIORITY[current.status] > STATUS_PRIORITY[strictest.status] ? current : strictest,
    );
}

export function explicitProductConstraintRank(status: ExplicitProductConstraintStatus) {
  if (status === ExplicitProductConstraintStatuses.DISQUALIFIED) return 2;
  if (status === ExplicitProductConstraintStatuses.NEEDS_CONFIRMATION) return 1;
  return 0;
}

function blocksRecommendation(status: ExplicitProductConstraintStatus) {
  return status === ExplicitProductConstraintStatuses.DISQUALIFIED ||
    status === ExplicitProductConstraintStatuses.NEEDS_CONFIRMATION;
}

/**
 * "Najbolji izbor" is a final selection. It requires a confirmed landed-cost
 * result. High confidence in a listing, including a compatible lens, is not
 * enough while the supplier price and import costs are still unverified.
 */
export function canPresentBestChoice(input: {
  status: ExplicitProductConstraintStatus;
  confidenceScore: number | null;
  finalEligible: boolean;
}) {
  if (blocksRecommendation(input.status) || !input.finalEligible) return false;
  return (input.confidenceScore ?? 0) >= 60;
}

export function canPresentPreliminaryCandidate(input: {
  status: ExplicitProductConstraintStatus;
  confidenceScore: number | null;
  finalEligible: boolean;
}) {
  if (canPresentBestChoice(input) || blocksRecommendation(input.status)) return false;
  return input.status === ExplicitProductConstraintStatuses.COMPATIBLE ||
    input.status === ExplicitProductConstraintStatuses.NOT_APPLICABLE;
}

export function allowGenericProductMatchClaim(input: {
  requirementStatus: string | null | undefined;
  productFormStatus: string | null | undefined;
  requestedCompleteSystem: boolean;
  constraintStatus: ExplicitProductConstraintStatus;
}) {
  if (
    input.constraintStatus === ExplicitProductConstraintStatuses.DISQUALIFIED ||
    input.constraintStatus === ExplicitProductConstraintStatuses.NEEDS_CONFIRMATION
  ) {
    return false;
  }
  if (input.constraintStatus === ExplicitProductConstraintStatuses.COMPATIBLE) return true;
  if (input.requirementStatus === "FULL") return true;
  return input.requestedCompleteSystem && input.productFormStatus === "MATCH";
}
