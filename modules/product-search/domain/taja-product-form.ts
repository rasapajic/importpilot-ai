import type { SupplierOfferSearchResult } from "./search";
import { extractTajaRequestedRequirements } from "./taja-requirement-match";

export const TajaOfferProductForms = {
  COMPLETE_SYSTEM: "COMPLETE_SYSTEM",
  PUMP_ONLY: "PUMP_ONLY",
  NOZZLES_ONLY: "NOZZLES_ONLY",
  COMPONENT: "COMPONENT",
  UNCLEAR: "UNCLEAR",
} as const;

export type TajaOfferProductForm =
  (typeof TajaOfferProductForms)[keyof typeof TajaOfferProductForms];

export const TajaProductFormMatchStatuses = {
  MATCH: "MATCH",
  UNCLEAR: "UNCLEAR",
  MISMATCH: "MISMATCH",
} as const;

export type TajaProductFormMatchStatus =
  (typeof TajaProductFormMatchStatuses)[keyof typeof TajaProductFormMatchStatuses];

export type TajaProductFormAssessment = {
  form: TajaOfferProductForm;
  matchStatus: TajaProductFormMatchStatus;
  requestedCompleteSystem: boolean;
  scoreAdjustment: number;
};

const MISTING_PATTERN = /\b(?:mist\w*|fog\w*|humidif\w*|spray\s+cooling|water\s+mist)\b/;
const SYSTEM_PATTERN = /\b(?:system|solution|equipment)\b/;
const COMPLETE_MARKER_PATTERN = /\b(?:kit|set|complete|package|bundle)\b/;
const PUMP_PATTERN = /\b(?:pump\w*|pomp\w*)\b/;
const NOZZLE_PATTERN = /\b(?:nozzl\w*|sprayer\w*|(?:mist|spray)\s*head\w*)\b/;
const COMPONENT_PATTERN = /\b(?:hose|pipe|tube|fitting|connector|adapter|valve|filter|timer|controller|control\s+unit|clamp|tee|elbow|replacement|spare|accessor\w*|plug)\b/;
const NOZZLE_ONLY_PATTERN = /\b(?:mist|spray|atomiz\w*)\s+nozzl\w*\b|\bnozzl\w*\s+(?:kit|set|pack)\b|\b(?:kit|set|pack)\s+(?:of\s+)?(?:\d+\s+)?nozzl\w*\b/;
const PUMP_ONLY_PATTERN = /\b(?:high[-\s]*pressure|booster|diaphragm|water)\s+pump\b|\bpump\s+(?:unit|kit|set|motor)\b/;
const REQUEST_COMPLETE_PATTERN = /\b(?:system|sistem\w*|kit|set|komplet\w*|complete|package)\b/;

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tajaRequestsCompleteSystem(productQuery: string) {
  const query = normalize(productQuery);
  const requirements = extractTajaRequestedRequirements(productQuery);
  return REQUEST_COMPLETE_PATTERN.test(query) ||
    (requirements.misting && requirements.pump && requirements.nozzles);
}

export function classifyTajaOfferProductForm(
  result: Pick<SupplierOfferSearchResult, "title">,
): TajaOfferProductForm {
  const title = normalize(result.title);
  const hasMisting = MISTING_PATTERN.test(title);
  const hasSystem = SYSTEM_PATTERN.test(title);
  const hasCompleteMarker = COMPLETE_MARKER_PATTERN.test(title);
  const hasPump = PUMP_PATTERN.test(title);
  const hasNozzle = NOZZLE_PATTERN.test(title);
  const hasComponent = COMPONENT_PATTERN.test(title);

  const explicitNozzleOnly = hasNozzle &&
    NOZZLE_ONLY_PATTERN.test(title) &&
    !hasPump &&
    !/\b(?:system|kit|set|package|bundle)\s+with\b/.test(title);
  if (explicitNozzleOnly) return TajaOfferProductForms.NOZZLES_ONLY;

  const explicitPumpOnly = hasPump &&
    PUMP_ONLY_PATTERN.test(title) &&
    !hasNozzle &&
    !hasSystem &&
    !hasCompleteMarker;
  if (explicitPumpOnly) return TajaOfferProductForms.PUMP_ONLY;

  if (
    hasMisting &&
    (
      (hasCompleteMarker && (hasPump || hasNozzle || hasSystem)) ||
      (hasSystem && (hasPump || hasNozzle)) ||
      (hasPump && hasNozzle)
    )
  ) {
    return TajaOfferProductForms.COMPLETE_SYSTEM;
  }

  if (hasMisting && hasSystem && !hasComponent) {
    return TajaOfferProductForms.COMPLETE_SYSTEM;
  }

  if (hasComponent && !hasCompleteMarker && !(hasSystem && hasPump)) {
    return TajaOfferProductForms.COMPONENT;
  }

  if (hasNozzle && !hasPump && !hasCompleteMarker) {
    return TajaOfferProductForms.NOZZLES_ONLY;
  }

  if (hasPump && !hasNozzle && !hasSystem && !hasCompleteMarker) {
    return TajaOfferProductForms.PUMP_ONLY;
  }

  return TajaOfferProductForms.UNCLEAR;
}

export function evaluateTajaProductForm(
  productQuery: string,
  result: Pick<SupplierOfferSearchResult, "title">,
): TajaProductFormAssessment {
  const requestedCompleteSystem = tajaRequestsCompleteSystem(productQuery);
  const form = classifyTajaOfferProductForm(result);

  if (!requestedCompleteSystem) {
    return {
      form,
      matchStatus: TajaProductFormMatchStatuses.MATCH,
      requestedCompleteSystem,
      scoreAdjustment: 0,
    };
  }

  if (form === TajaOfferProductForms.COMPLETE_SYSTEM) {
    return {
      form,
      matchStatus: TajaProductFormMatchStatuses.MATCH,
      requestedCompleteSystem,
      scoreAdjustment: 8,
    };
  }

  if (form === TajaOfferProductForms.UNCLEAR) {
    return {
      form,
      matchStatus: TajaProductFormMatchStatuses.UNCLEAR,
      requestedCompleteSystem,
      scoreAdjustment: -4,
    };
  }

  return {
    form,
    matchStatus: TajaProductFormMatchStatuses.MISMATCH,
    requestedCompleteSystem,
    scoreAdjustment: -35,
  };
}

export function tajaProductFormRank(status: TajaProductFormMatchStatus) {
  if (status === TajaProductFormMatchStatuses.MATCH) return 0;
  if (status === TajaProductFormMatchStatuses.UNCLEAR) return 1;
  return 2;
}

export function sameTajaPriceComparisonGroup(
  left: TajaProductFormAssessment,
  right: TajaProductFormAssessment,
) {
  if (!left.requestedCompleteSystem || !right.requestedCompleteSystem) return true;
  if (
    left.matchStatus === TajaProductFormMatchStatuses.MATCH &&
    right.matchStatus === TajaProductFormMatchStatuses.MATCH
  ) {
    return true;
  }
  return left.form === right.form;
}
