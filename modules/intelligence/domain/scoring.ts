import { getMoqStatus } from "../../offers/domain/moq-status";
import {
  assessSupplierRiskV2,
  SupplierRiskLevels,
  type SupplierRiskLevel,
} from "./supplier-risk-v2";
import {
  RecommendationStatuses,
  type RecommendationStatusValue,
} from "./recommendation";

export const ASSESSMENT_VERSION = "offer-intelligence-v2";

export type AssessmentOfferInput = {
  offerId: string;
  supplierName: string;
  supplierCountry: string | null;
  supplierVerified: boolean | null;
  yearsOnPlatform: number | null;
  responseRatePercent: number | null;
  transactionCount?: number | null;
  employeeCount?: number | null;
  profileCompletenessScore?: number | null;
  moq: number | null;
  unitPrice: number | null;
  currency: string | null;
  incoterm: string | null;
  deliveryTimeDays: number | null;
  sampleAvailable: boolean | null;
  termsClarityScore: number | null;
  shippingClarityScore: number | null;
  projectQuantity: number;
  projectTargetMargin: number;
  landedCostPerUnit: number | null;
  grossMarginPercent: number | null;
};

export type PriceComparison = {
  currency: string;
  unitPrices: number[];
};

export type ScoreComponent = {
  key: string;
  score: number;
  maxScore: number;
  known: boolean;
  note: string;
};

export type OfferAssessmentResult = {
  supplierRiskScore: number;
  offerQualityScore: number;
  overallScore: number;
  confidenceScore: number;
  recommendationStatus: RecommendationStatusValue;
  explanation: string;
  scoreBreakdown: {
    risk: ScoreComponent[];
    quality: ScoreComponent[];
    criticalWarnings: string[];
    buyBlockers: string[];
    moq: ReturnType<typeof getMoqStatus>;
    supplierRiskV2: {
      riskScore: number;
      riskLevel: SupplierRiskLevel;
      reasons: string[];
      knownCount: number;
    };
  };
  assessmentVersion: string;
};

function riskComponent(
  key: string,
  score: number,
  maxScore: number,
  known: boolean,
  note: string,
): ScoreComponent {
  return { key, score, maxScore, known, note };
}

function qualityComponent(
  key: string,
  score: number,
  maxScore: number,
  known: boolean,
  note: string,
): ScoreComponent {
  return { key, score, maxScore, known, note };
}

function round(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export function calculateSupplierRisk(
  offer: AssessmentOfferInput,
  comparison?: PriceComparison,
) {
  const supplierRiskV2 = assessSupplierRiskV2({
    verifiedSupplier: offer.supplierVerified,
    yearsOnPlatform: offer.yearsOnPlatform,
    responseRatePercent: offer.responseRatePercent,
    transactionCount: offer.transactionCount ?? null,
    employeeCount: offer.employeeCount ?? null,
    profileCompletenessScore: offer.profileCompletenessScore ?? null,
    sampleAvailable: offer.sampleAvailable,
    clearCommercialTermsScore: offer.termsClarityScore,
    clearTransportScore: offer.shippingClarityScore,
  });
  const moqRatio = offer.moq === null ? null : offer.moq / offer.projectQuantity;
  const priceMedian =
    comparison &&
    offer.currency === comparison.currency &&
    comparison.unitPrices.length >= 3 &&
    offer.unitPrice !== null
      ? median(comparison.unitPrices)
      : null;
  const priceRatio =
    priceMedian && priceMedian > 0 && offer.unitPrice !== null
      ? offer.unitPrice / priceMedian
      : null;

  const components: ScoreComponent[] = [
    riskComponent(
      "supplierCountryKnown",
      0,
      0,
      offer.supplierCountry !== null,
      offer.supplierCountry
        ? `Zemlja dobavljača je poznata: ${offer.supplierCountry}.`
        : "Zemlja dobavljača nije poznata.",
    ),
    riskComponent(
      "supplierVerified",
      offer.supplierVerified === false ? 15 : offer.supplierVerified === true ? -15 : 0,
      15,
      offer.supplierVerified !== null,
      offer.supplierVerified === false
        ? "Dobavljač nije verifikovan."
        : offer.supplierVerified === true
          ? "Dobavljač je verifikovan."
          : "Verifikacija dobavljača nije poznata.",
    ),
    riskComponent(
      "yearsOnPlatform",
      offer.yearsOnPlatform === null
        ? 0
        : offer.yearsOnPlatform >= 3
          ? -10
          : offer.yearsOnPlatform < 1
            ? 10
            : 0,
      10,
      offer.yearsOnPlatform !== null,
      offer.yearsOnPlatform === null
        ? "Godine na platformi nisu poznate."
        : `${offer.yearsOnPlatform} godina na platformi.`,
    ),
    riskComponent(
      "responseRate",
      offer.responseRatePercent === null
        ? 0
        : offer.responseRatePercent >= 80
          ? -10
          : offer.responseRatePercent < 50
            ? 10
            : 0,
      10,
      offer.responseRatePercent !== null,
      offer.responseRatePercent === null
        ? "Stopa odgovora nije poznata."
        : `Stopa odgovora je ${offer.responseRatePercent}%.`,
    ),
    riskComponent(
      "moq",
      moqRatio === null ? 0 : moqRatio > 1 ? 10 : 0,
      10,
      moqRatio !== null,
      moqRatio === null
        ? "MOQ nije poznat."
        : moqRatio > 1
          ? "MOQ je viši od planirane količine."
          : "MOQ odgovara planiranoj količini.",
    ),
    riskComponent(
      "transactionCount",
      offer.transactionCount === null || offer.transactionCount === undefined
        ? 0
        : offer.transactionCount >= 50
          ? -10
          : offer.transactionCount === 0
            ? 10
            : 0,
      10,
      offer.transactionCount !== null && offer.transactionCount !== undefined,
      offer.transactionCount === null || offer.transactionCount === undefined
        ? "Broj transakcija nije poznat."
        : `${offer.transactionCount} zabeleženih transakcija.`,
    ),
    riskComponent(
      "profileCompleteness",
      offer.profileCompletenessScore === null || offer.profileCompletenessScore === undefined
        ? 0
        : offer.profileCompletenessScore >= 70
          ? -10
          : offer.profileCompletenessScore < 40
            ? 10
            : 0,
      10,
      offer.profileCompletenessScore !== null && offer.profileCompletenessScore !== undefined,
      offer.profileCompletenessScore === null || offer.profileCompletenessScore === undefined
        ? "Kvalitet profila nije poznat."
        : `Kvalitet profila je ${offer.profileCompletenessScore}/100.`,
    ),
    riskComponent(
      "termsClarity",
      offer.termsClarityScore === null ? 0 : offer.termsClarityScore >= 70 ? -5 : offer.termsClarityScore < 40 ? 5 : 0,
      5,
      offer.termsClarityScore !== null,
      offer.termsClarityScore === null ? "Jasnoća uslova nije ocenjena." : `Jasnoća uslova: ${offer.termsClarityScore}/100.`,
    ),
    riskComponent(
      "shippingClarity",
      offer.shippingClarityScore === null ? 0 : offer.shippingClarityScore >= 70 ? -5 : offer.shippingClarityScore < 40 ? 5 : 0,
      5,
      offer.shippingClarityScore !== null,
      offer.shippingClarityScore === null ? "Jasnoća transporta nije ocenjena." : `Jasnoća transporta: ${offer.shippingClarityScore}/100.`,
    ),
    riskComponent(
      "suspiciousLowPrice",
      priceRatio === null ? 0 : priceRatio <= 0.7 ? 15 : priceRatio <= 0.85 ? 8 : 0,
      15,
      priceRatio !== null,
      priceRatio === null
        ? "Nema najmanje tri uporedive ponude iste valute."
        : priceRatio <= 0.85
          ? "Cena je značajno niža od medijane uporedivih ponuda."
          : "Cena nije sumnjivo niska u odnosu na medijanu.",
    ),
  ];

  return { score: supplierRiskV2.riskScore, components, supplierRiskV2 };
}

export function calculateOfferQuality(offer: AssessmentOfferInput) {
  const moqRatio = offer.moq === null ? null : offer.moq / offer.projectQuantity;
  const marginScore =
    offer.grossMarginPercent === null
      ? 15
      : offer.grossMarginPercent >= offer.projectTargetMargin
        ? 30
        : offer.grossMarginPercent >= offer.projectTargetMargin * 0.75
          ? 24
          : offer.grossMarginPercent >= 0
            ? 15
            : 0;
  const deliveryScore =
    offer.deliveryTimeDays === null
      ? 7
      : offer.deliveryTimeDays <= 15
        ? 15
        : offer.deliveryTimeDays <= 30
          ? 12
          : offer.deliveryTimeDays <= 45
            ? 8
            : offer.deliveryTimeDays <= 60
              ? 4
              : 0;

  const components: ScoreComponent[] = [
    qualityComponent("landedCostAndMargin", marginScore, 30, offer.grossMarginPercent !== null, offer.grossMarginPercent === null ? "Landed cost kalkulacija nije dostupna." : `Bruto marža je ${offer.grossMarginPercent}%.`),
    qualityComponent("shippingClarity", offer.shippingClarityScore === null ? 5 : Math.round(offer.shippingClarityScore / 10), 10, offer.shippingClarityScore !== null, offer.shippingClarityScore === null ? "Jasnoća transporta nije ocenjena." : `Jasnoća transporta: ${offer.shippingClarityScore}/100.`),
    qualityComponent("deliveryTime", deliveryScore, 15, offer.deliveryTimeDays !== null, offer.deliveryTimeDays === null ? "Rok isporuke nije poznat." : `Rok isporuke je ${offer.deliveryTimeDays} dana.`),
    qualityComponent("moqFit", moqRatio === null ? 5 : moqRatio <= 0.5 ? 10 : moqRatio <= 1 ? 8 : moqRatio <= 1.5 ? 4 : 0, 10, moqRatio !== null, moqRatio === null ? "MOQ nije poznat." : moqRatio <= 1 ? "MOQ odgovara projektu." : "MOQ je viši od količine projekta."),
    qualityComponent("incoterm", offer.incoterm ? 10 : 5, 10, offer.incoterm !== null, offer.incoterm ? `Incoterm je naveden: ${offer.incoterm}.` : "Incoterm nije naveden."),
    qualityComponent("sampleAvailable", offer.sampleAvailable === null ? 5 : offer.sampleAvailable ? 10 : 0, 10, offer.sampleAvailable !== null, offer.sampleAvailable === null ? "Dostupnost uzorka nije poznata." : offer.sampleAvailable ? "Uzorak je dostupan." : "Uzorak nije dostupan."),
    qualityComponent("offerClarity", offer.termsClarityScore === null ? 7 : Math.round((offer.termsClarityScore / 100) * 15), 15, offer.termsClarityScore !== null, offer.termsClarityScore === null ? "Jasnoća ponude nije ocenjena." : `Jasnoća ponude: ${offer.termsClarityScore}/100.`),
  ];

  return { score: components.reduce((sum, component) => sum + component.score, 0), components };
}

export function determineRecommendation(input: {
  overallScore: number;
  supplierRiskScore: number;
  hasLandedCost: boolean;
  criticalWarnings: string[];
  buyBlockers?: string[];
}) {
  if (input.criticalWarnings.length > 0) return RecommendationStatuses.NOT_RECOMMENDED;
  if (
    input.overallScore >= 80 &&
    input.supplierRiskScore <= 30 &&
    input.hasLandedCost &&
    (input.buyBlockers?.length ?? 0) === 0
  ) {
    return RecommendationStatuses.RECOMMENDED;
  }
  if ((input.buyBlockers?.length ?? 0) > 0 && input.overallScore >= 45) {
    return RecommendationStatuses.NEEDS_NEGOTIATION;
  }
  if (input.overallScore >= 65 && input.supplierRiskScore <= 55) {
    return RecommendationStatuses.OK_WITH_RISK;
  }
  if (input.overallScore >= 45) return RecommendationStatuses.NEEDS_NEGOTIATION;
  return RecommendationStatuses.NOT_RECOMMENDED;
}

export function generateDeterministicExplanation(
  offer: AssessmentOfferInput,
  result: Omit<OfferAssessmentResult, "explanation" | "assessmentVersion">,
) {
  const positives: string[] = [];
  const actions: string[] = [];
  const moq = result.scoreBreakdown.moq;
  if (offer.grossMarginPercent !== null && offer.grossMarginPercent >= offer.projectTargetMargin) {
    positives.push("procenjena marža dostiže cilj projekta");
  }
  if (result.scoreBreakdown.supplierRiskV2.riskLevel === SupplierRiskLevels.LOW) {
    positives.push("rizik dobavljača je nizak");
  }
  if (offer.deliveryTimeDays !== null && offer.deliveryTimeDays <= 30) positives.push("rok isporuke je konkurentan");
  if (moq.status === "BLOCKING") actions.push("pregovarajte o nižoj minimalnoj količini (MOQ)");
  if (offer.shippingClarityScore === null || offer.shippingClarityScore < 70) actions.push("tražite potvrdu transporta i Incoterm uslova");
  if (offer.termsClarityScore === null || offer.termsClarityScore < 70) actions.push("razjasnite komercijalne uslove");
  if (offer.sampleAvailable !== true) actions.push("zatražite uzorak pre kupovine");
  if (result.scoreBreakdown.supplierRiskV2.riskLevel === SupplierRiskLevels.HIGH) {
    actions.push("proverite dobavljača pre bilo kakve narudžbine");
  }

  const opening = positives.length
    ? `Ponuda ima prednosti: ${positives.join(", ")}.`
    : "Ponuda nema dovoljno potvrđenih prednosti za snažnu preporuku.";
  const next = actions.length
    ? `Pre odluke: ${actions.join("; ")}.`
    : "Ključni uslovi su dovoljno jasni za naredni korak.";
  return `${opening} ${next}`;
}

export function assessOffer(
  offer: AssessmentOfferInput,
  comparison?: PriceComparison,
): OfferAssessmentResult {
  const risk = calculateSupplierRisk(offer, comparison);
  const quality = calculateOfferQuality(offer);
  const moq = getMoqStatus({ projectQuantity: offer.projectQuantity, moq: offer.moq });
  const knownComponents = [...risk.components, ...quality.components].filter((item) => item.known).length;
  const totalComponents = risk.components.length + quality.components.length;
  const confidenceScore = round((knownComponents / totalComponents) * 100);
  const overallScore = round(quality.score * 0.6 + (100 - risk.score) * 0.4);
  const criticalWarnings = [
    ...(offer.supplierVerified === false && offer.responseRatePercent !== null && offer.responseRatePercent < 50
      ? ["Dobavljač nije verifikovan i ima nisku stopu odgovora."]
      : []),
    ...(offer.grossMarginPercent !== null && offer.grossMarginPercent < 0
      ? ["Procenjena bruto marža je negativna."]
      : []),
  ];
  const buyBlockers = [
    ...(moq.status === "BLOCKING" ? [moq.message] : []),
    ...(risk.supplierRiskV2.riskLevel === SupplierRiskLevels.HIGH
      ? ["Rizik dobavljača je visok."]
      : []),
  ];
  const recommendationStatus = determineRecommendation({
    overallScore,
    supplierRiskScore: risk.score,
    hasLandedCost: offer.landedCostPerUnit !== null,
    criticalWarnings,
    buyBlockers,
  });
  const base = {
    supplierRiskScore: risk.score,
    offerQualityScore: quality.score,
    overallScore,
    confidenceScore,
    recommendationStatus,
    scoreBreakdown: {
      risk: risk.components,
      quality: quality.components,
      criticalWarnings: [...criticalWarnings, ...buyBlockers],
      buyBlockers,
      moq,
      supplierRiskV2: {
        riskScore: risk.supplierRiskV2.riskScore,
        riskLevel: risk.supplierRiskV2.riskLevel,
        reasons: risk.supplierRiskV2.reasons,
        knownCount: risk.supplierRiskV2.knownCount,
      },
    },
  };

  return {
    ...base,
    explanation: generateDeterministicExplanation(offer, base),
    assessmentVersion: ASSESSMENT_VERSION,
  };
}
