import type { RecommendationStatusValue } from "../../intelligence/domain/recommendation";
import type { MoqStatusValue } from "../../offers/domain/moq-status";
import type { SupplierRiskLevel } from "../../intelligence/domain/supplier-risk-v2";

export const PROJECT_DECISION_VERSION = "project-decision-v1";

export const ProjectDecisionStatuses = {
  READY_TO_BUY: "READY_TO_BUY",
  NEGOTIATE_FIRST: "NEGOTIATE_FIRST",
  NEED_MORE_OFFERS: "NEED_MORE_OFFERS",
  DO_NOT_BUY: "DO_NOT_BUY",
} as const;

export type ProjectDecisionStatusValue =
  (typeof ProjectDecisionStatuses)[keyof typeof ProjectDecisionStatuses];

export type ProjectDecisionOffer = {
  offerId: string;
  supplierName: string;
  currency: string | null;
  incoterm: string | null;
  moq: number | null;
  moqExceedsProjectQuantity: boolean | null;
  moqStatus?: {
    status: MoqStatusValue;
    label: string;
    message: string;
  };
  sampleAvailable: boolean | null;
  shippingClarityScore: number | null;
  landedCostTotal: number | null;
  landedCostPerUnit: number | null;
  grossMarginPercent: number | null;
  calculationNeedsReview: boolean;
  assessment: {
    overallScore: number;
    supplierRiskScore: number;
    supplierRiskLevel?: SupplierRiskLevel;
    confidenceScore: number;
    recommendationStatus: RecommendationStatusValue;
  } | null;
};

export type ActionItem = {
  key:
    | "REQUEST_SAMPLE"
    | "CONFIRM_INCOTERM"
    | "CONFIRM_SHIPPING"
    | "NEGOTIATE_MOQ"
    | "VERIFY_CUSTOMS"
    | "COMPARE_MORE_OFFERS";
  label: string;
  reason: string;
};

export type ProjectDecisionResult = {
  status: ProjectDecisionStatusValue;
  selectedOfferId: string | null;
  decisionReason: string;
  actionChecklist: ActionItem[];
  summarySnapshot: {
    offerCount: number;
    assessedOfferCount: number;
    primaryCurrency: string | null;
    comparableOfferCount: number;
    incomparableOfferCount: number;
    incomparableCurrencies: string[];
    bestOverallOffer: ProjectDecisionOffer | null;
    lowestRiskOffer: ProjectDecisionOffer | null;
    bestMarginOffer: ProjectDecisionOffer | null;
  };
  decisionVersion: string;
};

function rankBestOverall(offers: ProjectDecisionOffer[]) {
  return offers
    .filter((offer) => offer.assessment !== null)
    .sort((a, b) => {
      const overall = b.assessment!.overallScore - a.assessment!.overallScore;
      if (overall !== 0) return overall;
      const risk = a.assessment!.supplierRiskScore - b.assessment!.supplierRiskScore;
      if (risk !== 0) return risk;
      return (a.landedCostTotal ?? Number.MAX_SAFE_INTEGER) -
        (b.landedCostTotal ?? Number.MAX_SAFE_INTEGER);
    })[0] ?? null;
}

function minBy(
  offers: ProjectDecisionOffer[],
  value: (offer: ProjectDecisionOffer) => number | null,
) {
  return offers
    .filter((offer) => value(offer) !== null)
    .sort((a, b) => value(a)! - value(b)!)[0] ?? null;
}

function maxBy(
  offers: ProjectDecisionOffer[],
  value: (offer: ProjectDecisionOffer) => number | null,
) {
  return offers
    .filter((offer) => value(offer) !== null)
    .sort((a, b) => value(b)! - value(a)!)[0] ?? null;
}

function primaryCurrencyGroup(offers: ProjectDecisionOffer[]) {
  const groups = new Map<string, ProjectDecisionOffer[]>();
  for (const offer of offers) {
    if (!offer.currency) continue;
    groups.set(offer.currency, [...(groups.get(offer.currency) ?? []), offer]);
  }
  return [...groups.entries()].sort(
    ([currencyA, offersA], [currencyB, offersB]) =>
      offersB.length - offersA.length || currencyA.localeCompare(currencyB),
  )[0] ?? null;
}

function buildChecklist(
  best: ProjectDecisionOffer | null,
  comparableOfferCount: number,
) {
  const checklist: ActionItem[] = [];
  if (!best || best.sampleAvailable !== true) {
    checklist.push({
      key: "REQUEST_SAMPLE",
      label: "Traži uzorak",
      reason: "Uzorak nije potvrđen za najbolju dostupnu ponudu.",
    });
  }
  if (!best?.incoterm) {
    checklist.push({
      key: "CONFIRM_INCOTERM",
      label: "Potvrdi Incoterm",
      reason: "Incoterm nije potvrđen.",
    });
  }
  if (!best || best.shippingClarityScore === null || best.shippingClarityScore < 70) {
    checklist.push({
      key: "CONFIRM_SHIPPING",
      label: "Potvrdi transport",
      reason: "Transportni uslovi nisu dovoljno jasni.",
    });
  }
  if (best?.moqExceedsProjectQuantity === true) {
    checklist.push({
      key: "NEGOTIATE_MOQ",
      label: "Pregovaraj MOQ",
      reason: "Potvrdite da MOQ odgovara finalnoj količini i uslovima kupovine.",
    });
  }
  if (!best || best.calculationNeedsReview || best.landedCostTotal === null) {
    checklist.push({
      key: "VERIFY_CUSTOMS",
      label: "Proveri carinu",
      reason: "Carinska pretpostavka ili landed cost zahtevaju proveru.",
    });
  }
  if (comparableOfferCount < 3) {
    const missing = 3 - comparableOfferCount;
    checklist.push({
      key: "COMPARE_MORE_OFFERS",
      label: `Uporedi još ${missing} ${missing === 1 ? "ponudu" : "ponude"}`,
      reason: "Za pouzdaniju odluku potrebne su najmanje tri ponude iste valute.",
    });
  }
  return checklist;
}

export function createProjectDecision(offers: ProjectDecisionOffer[]): ProjectDecisionResult {
  const primary = primaryCurrencyGroup(offers);
  const primaryCurrency = primary?.[0] ?? null;
  const comparableOffers = primary?.[1] ?? [];
  const bestOverallOffer = rankBestOverall(comparableOffers);
  const lowestRiskOffer = minBy(
    comparableOffers,
    (offer) => offer.assessment?.supplierRiskScore ?? null,
  );
  const bestMarginOffer = maxBy(comparableOffers, (offer) => offer.grossMarginPercent);
  const assessedOfferCount = offers.filter((offer) => offer.assessment !== null).length;
  const incomparableCurrencies = [
    ...new Set(
      offers
        .filter((offer) => !primaryCurrency || offer.currency !== primaryCurrency)
        .map((offer) => offer.currency ?? "NO_CURRENCY"),
    ),
  ].sort();
  const incomparableOfferCount = offers.length - comparableOffers.length;
  const checklist = buildChecklist(bestOverallOffer, comparableOffers.length);

  let status: ProjectDecisionStatusValue;
  if (offers.length < 3 || assessedOfferCount < 2 || comparableOffers.length < 2) {
    status = ProjectDecisionStatuses.NEED_MORE_OFFERS;
  } else if (
    !bestOverallOffer ||
    bestOverallOffer.assessment?.recommendationStatus === "NOT_RECOMMENDED"
  ) {
    status = ProjectDecisionStatuses.DO_NOT_BUY;
  } else if (
    bestOverallOffer.assessment?.recommendationStatus === "RECOMMENDED" &&
    bestOverallOffer.assessment.supplierRiskScore <= 30 &&
    bestOverallOffer.assessment.supplierRiskLevel !== "HIGH" &&
    bestOverallOffer.assessment.confidenceScore >= 70 &&
    bestOverallOffer.moqExceedsProjectQuantity !== true &&
    bestOverallOffer.shippingClarityScore !== null &&
    bestOverallOffer.shippingClarityScore >= 70 &&
    Boolean(bestOverallOffer.incoterm) &&
    bestOverallOffer.sampleAvailable === true &&
    !bestOverallOffer.calculationNeedsReview
  ) {
    status = ProjectDecisionStatuses.READY_TO_BUY;
  } else {
    status = ProjectDecisionStatuses.NEGOTIATE_FIRST;
  }

  const comparisonSentence =
    incomparableOfferCount > 0
      ? `Imate ${offers.length} ponuda, ali ${comparableOffers.length} su direktno uporedive u valuti ${primaryCurrency ?? "bez potvrđene valute"}.`
      : `Imate ${offers.length} ponuda i sve su uporedive u valuti ${primaryCurrency ?? "bez potvrđene valute"}.`;
  const bestSentence = bestOverallOffer
    ? `Najbolja ukupna ponuda je ${bestOverallOffer.supplierName} sa ocenom ${bestOverallOffer.assessment?.overallScore ?? 0}/100.`
    : "Još nema dovoljno ocenjenih ponuda za izbor najbolje ponude.";
  const nextSentence =
    checklist.length > 0
      ? `Pre kupovine: ${checklist.slice(0, 2).map((item) => item.label.toLowerCase()).join(" i ")}.`
      : "Ključne provere su završene.";

  return {
    status,
    selectedOfferId: bestOverallOffer?.offerId ?? null,
    decisionReason: `${comparisonSentence} ${bestSentence} ${nextSentence}`,
    actionChecklist: checklist,
    summarySnapshot: {
      offerCount: offers.length,
      assessedOfferCount,
      primaryCurrency,
      comparableOfferCount: comparableOffers.length,
      incomparableOfferCount,
      incomparableCurrencies,
      bestOverallOffer,
      lowestRiskOffer,
      bestMarginOffer,
    },
    decisionVersion: PROJECT_DECISION_VERSION,
  };
}
