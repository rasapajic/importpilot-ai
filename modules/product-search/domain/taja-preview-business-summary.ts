import {
  marketplaceDetailsToSupplierLogistics,
} from "./marketplace-product-details";
import type {
  SupplierOfferMarketplaceDetails,
  SupplierOfferUrlPreview,
} from "./search";
import {
  classifyTajaOfferProductForm,
  evaluateTajaProductForm,
  TajaOfferProductForms,
  TajaProductFormMatchStatuses,
  type TajaOfferProductForm,
  type TajaProductFormMatchStatus,
} from "./taja-product-form";
import {
  evaluateTajaRequirementMatch,
  extractTajaRequestedRequirements,
  TajaRequirementEvidenceStatuses,
  TajaRequirementMatchStatuses,
  type TajaRequirementEvidenceStatus,
  type TajaRequirementMatchStatus,
} from "./taja-requirement-match";

export const TajaPreviewBusinessStatuses = {
  READY: "READY",
  REVIEW: "REVIEW",
  BLOCKED: "BLOCKED",
} as const;

export type TajaPreviewBusinessStatus =
  (typeof TajaPreviewBusinessStatuses)[keyof typeof TajaPreviewBusinessStatuses];

export const TajaPreviewPriceBasisStatuses = {
  MISSING: "MISSING",
  CONFIRMED: "CONFIRMED",
  UNCONFIRMED: "UNCONFIRMED",
} as const;

export type TajaPreviewPriceBasisStatus =
  (typeof TajaPreviewPriceBasisStatuses)[keyof typeof TajaPreviewPriceBasisStatuses];

export const TajaPreviewMoqStatuses = {
  UNKNOWN: "UNKNOWN",
  STATED: "STATED",
  OK: "OK",
  BLOCKING: "BLOCKING",
} as const;

export type TajaPreviewMoqStatus =
  (typeof TajaPreviewMoqStatuses)[keyof typeof TajaPreviewMoqStatuses];

export const TajaPreviewLandedCostStatuses = {
  MISSING_PRICE: "MISSING_PRICE",
  BLOCKED_PRICE_BASIS: "BLOCKED_PRICE_BASIS",
  BLOCKED_MOQ: "BLOCKED_MOQ",
  BLOCKED_INCOTERM: "BLOCKED_INCOTERM",
  BLOCKED_LOGISTICS: "BLOCKED_LOGISTICS",
  READY_FOR_ESTIMATE: "READY_FOR_ESTIMATE",
} as const;

export type TajaPreviewLandedCostStatus =
  (typeof TajaPreviewLandedCostStatuses)[keyof typeof TajaPreviewLandedCostStatuses];

export const TajaPreviewNextActions = {
  CONFIRM_PRICE_AND_CONTENTS: "CONFIRM_PRICE_AND_CONTENTS",
  DO_NOT_COMPARE_AS_REQUESTED_PRODUCT: "DO_NOT_COMPARE_AS_REQUESTED_PRODUCT",
  CONFIRM_REQUIREMENTS: "CONFIRM_REQUIREMENTS",
  NEGOTIATE_MOQ: "NEGOTIATE_MOQ",
  CONFIRM_INCOTERM: "CONFIRM_INCOTERM",
  CONFIRM_PACKAGING: "CONFIRM_PACKAGING",
  READY_TO_COMPARE: "READY_TO_COMPARE",
} as const;

export type TajaPreviewNextAction =
  (typeof TajaPreviewNextActions)[keyof typeof TajaPreviewNextActions];

export type TajaPreviewBusinessSummary = {
  status: TajaPreviewBusinessStatus;
  productForm: TajaOfferProductForm;
  productFormMatchStatus: TajaProductFormMatchStatus | null;
  requirementMatchStatus: TajaRequirementMatchStatus | null;
  requestedCompleteSystem: boolean;
  requestedNozzleCount: number | null;
  pumpStatus: TajaRequirementEvidenceStatus;
  pumpValue: string | null;
  nozzleStatus: TajaRequirementEvidenceStatus;
  nozzleValue: string | null;
  nozzleCountStatus: TajaRequirementEvidenceStatus | null;
  priceBasisStatus: TajaPreviewPriceBasisStatus;
  sellingUnit: string | null;
  moqStatus: TajaPreviewMoqStatus;
  requestedQuantity: number | null;
  landedCostStatus: TajaPreviewLandedCostStatus;
  nextAction: TajaPreviewNextAction;
};

type PreviewSummaryContext = {
  productQuery?: string | null;
  requestedQuantity?: number | null;
};

function normalizedName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function findAttributeValue(
  details: SupplierOfferMarketplaceDetails | null | undefined,
  patterns: RegExp[],
) {
  for (const attribute of details?.attributes ?? []) {
    const name = normalizedName(attribute.name);
    if (patterns.some((pattern) => pattern.test(name))) return attribute.value;
  }
  return null;
}

function featureStatus(
  featureQuery: string,
  preview: SupplierOfferUrlPreview,
) {
  const match = evaluateTajaRequirementMatch(featureQuery, {
    title: preview.title ?? "",
    marketplaceDetails: preview.details ?? null,
  });
  return match.checks[0]?.evidenceStatus ??
    TajaRequirementEvidenceStatuses.UNCONFIRMED;
}

function normalizeRequestedQuantity(value: number | null | undefined) {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : null;
}

function evaluateMoq(
  minimumOrderQuantity: number | null,
  requestedQuantity: number | null,
): TajaPreviewMoqStatus {
  if (minimumOrderQuantity === null) return TajaPreviewMoqStatuses.UNKNOWN;
  if (requestedQuantity === null) return TajaPreviewMoqStatuses.STATED;
  return requestedQuantity >= minimumOrderQuantity
    ? TajaPreviewMoqStatuses.OK
    : TajaPreviewMoqStatuses.BLOCKING;
}

function priceBasisStatus(
  preview: SupplierOfferUrlPreview,
  productForm: TajaOfferProductForm,
): TajaPreviewPriceBasisStatus {
  if (preview.price === null || preview.currency === null) {
    return TajaPreviewPriceBasisStatuses.MISSING;
  }

  const sellingUnit = preview.details?.packaging?.sellingUnit?.trim() ?? "";
  const explicitSellingUnit = /\b(?:single\s+item|single\s+unit|piece|pc|unit|set|kit|pair)\b/i
    .test(sellingUnit);
  const clearProductForm = productForm !== TajaOfferProductForms.UNCLEAR;

  return explicitSellingUnit && clearProductForm
    ? TajaPreviewPriceBasisStatuses.CONFIRMED
    : TajaPreviewPriceBasisStatuses.UNCONFIRMED;
}

function landedCostStatus(input: {
  preview: SupplierOfferUrlPreview;
  priceBasis: TajaPreviewPriceBasisStatus;
  moq: TajaPreviewMoqStatus;
}) {
  if (input.priceBasis === TajaPreviewPriceBasisStatuses.MISSING) {
    return TajaPreviewLandedCostStatuses.MISSING_PRICE;
  }
  if (input.priceBasis !== TajaPreviewPriceBasisStatuses.CONFIRMED) {
    return TajaPreviewLandedCostStatuses.BLOCKED_PRICE_BASIS;
  }
  if (input.moq === TajaPreviewMoqStatuses.BLOCKING) {
    return TajaPreviewLandedCostStatuses.BLOCKED_MOQ;
  }
  if (!input.preview.incoterm) {
    return TajaPreviewLandedCostStatuses.BLOCKED_INCOTERM;
  }
  if (!marketplaceDetailsToSupplierLogistics(input.preview.details)) {
    return TajaPreviewLandedCostStatuses.BLOCKED_LOGISTICS;
  }
  return TajaPreviewLandedCostStatuses.READY_FOR_ESTIMATE;
}

function nextAction(input: {
  productForm: TajaOfferProductForm;
  productFormMatchStatus: TajaProductFormMatchStatus | null;
  requirementMatchStatus: TajaRequirementMatchStatus | null;
  priceBasisStatus: TajaPreviewPriceBasisStatus;
  moqStatus: TajaPreviewMoqStatus;
  landedCostStatus: TajaPreviewLandedCostStatus;
}) {
  if (input.productFormMatchStatus === TajaProductFormMatchStatuses.MISMATCH) {
    return TajaPreviewNextActions.DO_NOT_COMPARE_AS_REQUESTED_PRODUCT;
  }
  if (
    input.productForm === TajaOfferProductForms.UNCLEAR ||
    input.priceBasisStatus === TajaPreviewPriceBasisStatuses.UNCONFIRMED
  ) {
    return TajaPreviewNextActions.CONFIRM_PRICE_AND_CONTENTS;
  }
  if (
    input.requirementMatchStatus === TajaRequirementMatchStatuses.PARTIAL ||
    input.requirementMatchStatus === TajaRequirementMatchStatuses.UNCONFIRMED
  ) {
    return TajaPreviewNextActions.CONFIRM_REQUIREMENTS;
  }
  if (input.moqStatus === TajaPreviewMoqStatuses.BLOCKING) {
    return TajaPreviewNextActions.NEGOTIATE_MOQ;
  }
  if (input.landedCostStatus === TajaPreviewLandedCostStatuses.BLOCKED_INCOTERM) {
    return TajaPreviewNextActions.CONFIRM_INCOTERM;
  }
  if (input.landedCostStatus === TajaPreviewLandedCostStatuses.BLOCKED_LOGISTICS) {
    return TajaPreviewNextActions.CONFIRM_PACKAGING;
  }
  if (input.landedCostStatus === TajaPreviewLandedCostStatuses.MISSING_PRICE) {
    return TajaPreviewNextActions.CONFIRM_PRICE_AND_CONTENTS;
  }
  return TajaPreviewNextActions.READY_TO_COMPARE;
}

function businessStatus(input: {
  productFormMatchStatus: TajaProductFormMatchStatus | null;
  moqStatus: TajaPreviewMoqStatus;
  nextAction: TajaPreviewNextAction;
}) {
  if (
    input.productFormMatchStatus === TajaProductFormMatchStatuses.MISMATCH ||
    input.moqStatus === TajaPreviewMoqStatuses.BLOCKING
  ) {
    return TajaPreviewBusinessStatuses.BLOCKED;
  }
  return input.nextAction === TajaPreviewNextActions.READY_TO_COMPARE
    ? TajaPreviewBusinessStatuses.READY
    : TajaPreviewBusinessStatuses.REVIEW;
}

/**
 * Builds a concise, source-grounded business summary for a URL preview. This
 * helper never invents commercial facts: unclear product form, missing selling
 * unit or unusable packaging remain explicit blockers instead of being silently
 * promoted into a landed-cost estimate.
 */
export function buildTajaPreviewBusinessSummary(
  preview: SupplierOfferUrlPreview,
  context: PreviewSummaryContext = {},
): TajaPreviewBusinessSummary {
  const productQuery = context.productQuery?.trim() || null;
  const requestedQuantity = normalizeRequestedQuantity(context.requestedQuantity);
  const result = {
    title: preview.title ?? "",
    marketplaceDetails: preview.details ?? null,
  };
  const productFormAssessment = productQuery
    ? evaluateTajaProductForm(productQuery, result)
    : null;
  const productForm = productFormAssessment?.form ??
    classifyTajaOfferProductForm(result);
  const requirementMatch = productQuery
    ? evaluateTajaRequirementMatch(productQuery, result)
    : null;
  const requestedRequirements = productQuery
    ? extractTajaRequestedRequirements(productQuery)
    : null;
  const nozzleCountCheck = requirementMatch?.checks.find(
    (check) => check.key === "NOZZLE_COUNT",
  );
  const priceBasis = priceBasisStatus(preview, productForm);
  const moq = evaluateMoq(preview.minimumOrderQuantity, requestedQuantity);
  const landedCost = landedCostStatus({ preview, priceBasis, moq });
  const action = nextAction({
    productForm,
    productFormMatchStatus: productFormAssessment?.matchStatus ?? null,
    requirementMatchStatus: requirementMatch?.status ?? null,
    priceBasisStatus: priceBasis,
    moqStatus: moq,
    landedCostStatus: landedCost,
  });

  return {
    status: businessStatus({
      productFormMatchStatus: productFormAssessment?.matchStatus ?? null,
      moqStatus: moq,
      nextAction: action,
    }),
    productForm,
    productFormMatchStatus: productFormAssessment?.matchStatus ?? null,
    requirementMatchStatus: requirementMatch?.status ?? null,
    requestedCompleteSystem: productFormAssessment?.requestedCompleteSystem ?? false,
    requestedNozzleCount: requestedRequirements?.nozzleCount ?? null,
    pumpStatus: featureStatus("pump", preview),
    pumpValue: findAttributeValue(preview.details, [
      /^pump$/,
      /^pump type$/,
      /^pump model$/,
    ]),
    nozzleStatus: featureStatus("nozzles", preview),
    nozzleValue: findAttributeValue(preview.details, [
      /^nozzle$/,
      /^nozzles$/,
      /^nozzle count$/,
      /^nozzle quantity$/,
    ]),
    nozzleCountStatus: nozzleCountCheck?.evidenceStatus ?? null,
    priceBasisStatus: priceBasis,
    sellingUnit: preview.details?.packaging?.sellingUnit ?? null,
    moqStatus: moq,
    requestedQuantity,
    landedCostStatus: landedCost,
    nextAction: action,
  };
}
