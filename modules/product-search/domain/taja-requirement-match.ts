import type { SupplierOfferSearchResult } from "./search";

export const TajaRequirementMatchStatuses = {
  NOT_EVALUATED: "NOT_EVALUATED",
  FULL: "FULL",
  PARTIAL: "PARTIAL",
  UNCONFIRMED: "UNCONFIRMED",
} as const;

export type TajaRequirementMatchStatus =
  (typeof TajaRequirementMatchStatuses)[keyof typeof TajaRequirementMatchStatuses];

export const TajaRequirementEvidenceStatuses = {
  CONFIRMED: "CONFIRMED",
  LIKELY: "LIKELY",
  UNCONFIRMED: "UNCONFIRMED",
} as const;

export type TajaRequirementEvidenceStatus =
  (typeof TajaRequirementEvidenceStatuses)[keyof typeof TajaRequirementEvidenceStatuses];

export type TajaRequirementKey =
  | "MISTING"
  | "PATIO"
  | "PUMP"
  | "NOZZLES"
  | "NOZZLE_COUNT";

export type TajaRequestedRequirements = {
  misting: boolean;
  patio: boolean;
  pump: boolean;
  nozzles: boolean;
  nozzleCount: number | null;
};

export type TajaRequirementCheck = {
  key: TajaRequirementKey;
  evidenceStatus: TajaRequirementEvidenceStatus;
  confirmed: boolean;
  weight: number;
  expectedNumber?: number;
};

export type TajaRequirementMatch = {
  status: TajaRequirementMatchStatus;
  confirmedWeight: number;
  likelyWeight: number;
  totalWeight: number;
  scoreAdjustment: number;
  checks: TajaRequirementCheck[];
};

type FeatureDefinition = {
  key: Exclude<TajaRequirementKey, "NOZZLE_COUNT">;
  weight: number;
  queryPattern: RegExp;
  confirmedPattern: RegExp;
  likelyPattern?: RegExp;
  conflictingLikelyContextPattern?: RegExp;
};

const FEATURE_DEFINITIONS: FeatureDefinition[] = [
  {
    key: "MISTING",
    weight: 1,
    queryPattern: /\b(?:voden\w*\s+magl\w*|magl\w*|mist\w*|fog\w*)\b/,
    confirmedPattern: /\b(?:mist\w*|fog\w*|humidif\w*|spray\s+cooling)\b/,
  },
  {
    key: "PATIO",
    weight: 1,
    queryPattern: /\b(?:teras\w*|patio|terrace)\b/,
    confirmedPattern: /\b(?:patio|terrace|deck|veranda|balcony)\b/,
    likelyPattern: /\b(?:outdoor|garden)\b/,
    conflictingLikelyContextPattern: /\b(?:pool|zoo|aquarium|racecourse|greenhouse|farm|livestock|warehouse|factory|industrial)\b/,
  },
  {
    key: "PUMP",
    weight: 2,
    queryPattern: /\b(?:pump\w*|pomp\w*)\b/,
    confirmedPattern: /\b(?:pump\w*|pomp\w*)\b/,
  },
  {
    key: "NOZZLES",
    weight: 2,
    queryPattern: /\b(?:mlaznic\w*|nozzl\w*|dus\w*)\b/,
    confirmedPattern: /\b(?:nozzl\w*|sprayer\w*|(?:mist|spray)\s*head\w*|dus\w*)\b/,
  },
];

const NOZZLE_QUERY_ALIASES = "(?:mlaznic\\w*|nozzl\\w*|dus\\w*)";
const NOZZLE_OFFER_ALIASES =
  "(?:nozzl\\w*|sprayer\\w*|(?:mist|spray)\\s*head\\w*|dus\\w*)";
const OPTIONAL_PIECE_MARKER = "(?:(?:pcs?|pieces?)\\s+)?";
const NOZZLE_DESCRIPTOR_WORDS =
  "(?:(?!(?:and|with|plus|including|hose|pipe|tube|meter|metre)\\b)[a-z]+\\s+){0,4}";

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractNumberNearAlias(text: string, aliases: string) {
  const afterNumber = new RegExp(
    `\\b(\\d{1,4})\\s*${OPTIONAL_PIECE_MARKER}${NOZZLE_DESCRIPTOR_WORDS}${aliases}\\b`,
  );
  const beforeNumber = new RegExp(
    `\\b${aliases}\\s*(?:(?:set|kit)\\s+of\\s+)?(?:x\\s*)?(\\d{1,4})(?:\\s*(?:pcs?|pieces?))?\\b`,
  );
  const match = text.match(afterNumber) ?? text.match(beforeNumber);
  if (!match?.[1]) return null;
  const parsed = Number(match[1]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function offerConfirmsCount(text: string, count: number, aliases: string) {
  const afterNumber = new RegExp(
    `\\b${count}\\s*${OPTIONAL_PIECE_MARKER}${NOZZLE_DESCRIPTOR_WORDS}${aliases}\\b`,
  );
  const beforeNumber = new RegExp(
    `\\b${aliases}\\s*(?:(?:set|kit)\\s+of\\s+)?(?:x\\s*)?${count}(?:\\s*(?:pcs?|pieces?))?\\b`,
  );
  return afterNumber.test(text) || beforeNumber.test(text);
}

function evidenceStatus(
  definition: FeatureDefinition,
  offer: string,
): TajaRequirementEvidenceStatus {
  if (definition.confirmedPattern.test(offer)) {
    return TajaRequirementEvidenceStatuses.CONFIRMED;
  }
  if (
    definition.likelyPattern?.test(offer) &&
    !definition.conflictingLikelyContextPattern?.test(offer)
  ) {
    return TajaRequirementEvidenceStatuses.LIKELY;
  }
  return TajaRequirementEvidenceStatuses.UNCONFIRMED;
}

function createCheck(input: {
  key: TajaRequirementKey;
  evidenceStatus: TajaRequirementEvidenceStatus;
  weight: number;
  expectedNumber?: number;
}): TajaRequirementCheck {
  return {
    ...input,
    confirmed: input.evidenceStatus === TajaRequirementEvidenceStatuses.CONFIRMED,
  };
}

function matchStatus(checks: TajaRequirementCheck[]) {
  if (checks.length === 0) return TajaRequirementMatchStatuses.NOT_EVALUATED;
  if (checks.every((check) => check.confirmed)) return TajaRequirementMatchStatuses.FULL;
  if (checks.some((check) =>
    check.evidenceStatus !== TajaRequirementEvidenceStatuses.UNCONFIRMED,
  )) {
    return TajaRequirementMatchStatuses.PARTIAL;
  }
  return TajaRequirementMatchStatuses.UNCONFIRMED;
}

function scoreAdjustment(
  confirmedWeight: number,
  likelyWeight: number,
  totalWeight: number,
) {
  if (totalWeight <= 0) return 0;
  const effectiveWeight = confirmedWeight + likelyWeight * 0.5;
  const ratio = effectiveWeight / totalWeight;
  return Math.round((ratio - 0.5) * 24);
}

export function extractTajaRequestedRequirements(
  productQuery: string,
): TajaRequestedRequirements {
  const query = normalize(productQuery);
  const nozzleCount = extractNumberNearAlias(query, NOZZLE_QUERY_ALIASES);
  return {
    misting: FEATURE_DEFINITIONS[0]!.queryPattern.test(query),
    patio: FEATURE_DEFINITIONS[1]!.queryPattern.test(query),
    pump: FEATURE_DEFINITIONS[2]!.queryPattern.test(query),
    nozzles: FEATURE_DEFINITIONS[3]!.queryPattern.test(query) || nozzleCount !== null,
    nozzleCount,
  };
}

/**
 * Deterministic first-pass requirement verification from the user's product
 * description and the verified supplier-result title. Exact evidence is kept
 * separate from broad contextual relevance: for example, patio/terrace is
 * confirmed, outdoor/garden may be likely, while pool/zoo/racecourse context
 * does not prove patio use. Missing title detail remains unconfirmed until the
 * exact page or supplier response proves it.
 */
export function evaluateTajaRequirementMatch(
  productQuery: string,
  result: Pick<SupplierOfferSearchResult, "title">,
): TajaRequirementMatch {
  const query = normalize(productQuery);
  const offer = normalize(result.title);
  const checks: TajaRequirementCheck[] = [];
  const requestedNozzleCount = extractNumberNearAlias(query, NOZZLE_QUERY_ALIASES);

  for (const definition of FEATURE_DEFINITIONS) {
    if (!definition.queryPattern.test(query)) continue;
    if (definition.key === "NOZZLES" && requestedNozzleCount !== null) continue;
    checks.push(createCheck({
      key: definition.key,
      evidenceStatus: evidenceStatus(definition, offer),
      weight: definition.weight,
    }));
  }

  if (requestedNozzleCount !== null) {
    checks.push(createCheck({
      key: "NOZZLE_COUNT",
      expectedNumber: requestedNozzleCount,
      evidenceStatus: offerConfirmsCount(
        offer,
        requestedNozzleCount,
        NOZZLE_OFFER_ALIASES,
      )
        ? TajaRequirementEvidenceStatuses.CONFIRMED
        : TajaRequirementEvidenceStatuses.UNCONFIRMED,
      weight: 3,
    }));
  }

  const confirmedWeight = checks.reduce(
    (sum, check) => sum + (check.confirmed ? check.weight : 0),
    0,
  );
  const likelyWeight = checks.reduce(
    (sum, check) => sum + (
      check.evidenceStatus === TajaRequirementEvidenceStatuses.LIKELY
        ? check.weight
        : 0
    ),
    0,
  );
  const totalWeight = checks.reduce((sum, check) => sum + check.weight, 0);

  return {
    status: matchStatus(checks),
    confirmedWeight,
    likelyWeight,
    totalWeight,
    scoreAdjustment: scoreAdjustment(confirmedWeight, likelyWeight, totalWeight),
    checks,
  };
}

export function tajaRequirementMatchRank(status: TajaRequirementMatchStatus) {
  if (status === TajaRequirementMatchStatuses.FULL) return 0;
  if (status === TajaRequirementMatchStatuses.PARTIAL) return 1;
  if (status === TajaRequirementMatchStatuses.NOT_EVALUATED) return 2;
  return 3;
}
