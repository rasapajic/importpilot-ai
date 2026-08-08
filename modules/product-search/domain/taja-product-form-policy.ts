import {
  TajaCandidateAnalysisStatuses,
  TajaLandedCostStatuses,
  type TajaCandidateAnalysis,
  type TajaMissingDataKey,
} from "./taja-candidate-analysis";
import {
  evaluateTajaPriceSignal,
  TajaPriceSignalStatuses,
  type TajaPriceSignal,
} from "./taja-price-signal";
import {
  evaluateTajaProductForm,
  sameTajaPriceComparisonGroup,
  tajaProductFormRank,
  TajaOfferProductForms,
  TajaProductFormMatchStatuses,
  type TajaProductFormAssessment,
} from "./taja-product-form";
import type { SupplierOfferSearchResult } from "./search";

export type TajaCandidateAnalysisWithProductForm = TajaCandidateAnalysis & {
  productForm: TajaProductFormAssessment;
};

type AnalysisInput = {
  rankedResults: SupplierOfferSearchResult[];
  analyses: TajaCandidateAnalysis[];
  productQuery: string;
};

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function priceAllowsFinal(priceSignal: TajaPriceSignal) {
  return priceSignal.status === TajaPriceSignalStatuses.NORMAL ||
    priceSignal.status === TajaPriceSignalStatuses.UNAVAILABLE;
}

function adjustedMissingData(
  missingData: TajaMissingDataKey[],
  priceSignal: TajaPriceSignal,
) {
  const withoutPriceBasis = missingData.filter((key) => key !== "PRICE_BASIS");
  return priceAllowsFinal(priceSignal)
    ? withoutPriceBasis
    : [...withoutPriceBasis, "PRICE_BASIS" as const];
}

function mismatchExplanation(form: TajaProductFormAssessment) {
  if (form.matchStatus === TajaProductFormMatchStatuses.UNCLEAR) {
    return "Nije potvrđeno da prikazana cena obuhvata kompletan traženi sistem. ";
  }
  if (form.form === TajaOfferProductForms.NOZZLES_ONLY) {
    return "Ponuda izgleda kao set ili pojedinačne mlaznice, a ne kompletan traženi sistem. ";
  }
  if (form.form === TajaOfferProductForms.PUMP_ONLY) {
    return "Ponuda izgleda kao pumpa ili pumpna jedinica, a ne kompletan traženi sistem. ";
  }
  return "Ponuda izgleda kao komponenta ili rezervni deo, a ne kompletan traženi sistem. ";
}

function comparableResults(
  current: TajaProductFormAssessment,
  results: SupplierOfferSearchResult[],
  productQuery: string,
) {
  return results.filter((result) =>
    sameTajaPriceComparisonGroup(
      current,
      evaluateTajaProductForm(productQuery, result),
    ),
  );
}

function adjustedAnalysis(input: {
  analysis: TajaCandidateAnalysis;
  result: SupplierOfferSearchResult;
  productForm: TajaProductFormAssessment;
  priceSignal: TajaPriceSignal;
}): TajaCandidateAnalysisWithProductForm {
  const { analysis, productForm, priceSignal } = input;
  const productFormMatches =
    productForm.matchStatus === TajaProductFormMatchStatuses.MATCH;
  const productFormMismatch =
    productForm.matchStatus === TajaProductFormMatchStatuses.MISMATCH;
  const priceEligible = priceAllowsFinal(priceSignal);
  const finalEligible = analysis.finalEligible && productFormMatches && priceEligible;
  const overallScore = clampScore(
    analysis.overallScore -
    analysis.priceSignal.scoreAdjustment +
    priceSignal.scoreAdjustment +
    productForm.scoreAdjustment,
  );

  return {
    ...analysis,
    productForm,
    priceSignal,
    overallScore,
    missingData: adjustedMissingData(analysis.missingData, priceSignal),
    finalEligible,
    status: analysis.status === TajaCandidateAnalysisStatuses.FINAL && finalEligible
      ? analysis.status
      : TajaCandidateAnalysisStatuses.PRELIMINARY,
    landedCostStatus: productFormMismatch
      ? TajaLandedCostStatuses.UNAVAILABLE
      : analysis.landedCostStatus,
    preliminaryCostEstimate: productFormMismatch
      ? null
      : analysis.preliminaryCostEstimate,
    explanation: productFormMatches
      ? analysis.explanation
      : `${mismatchExplanation(productForm)}${analysis.explanation}`,
  };
}

/**
 * Keeps complete systems, uncertain offers and components in separate ranking
 * bands. Price outliers are recalculated only against comparable product forms,
 * so a 0.65 USD nozzle cannot make a complete system look overpriced. Known
 * component offers never receive a complete-system landed-cost estimate or a
 * FINAL recommendation. Grouped price signals also update PRICE_BASIS evidence
 * and may block, but never unsafely restore, an earlier final recommendation.
 */
export function applyTajaProductFormPolicy(input: AnalysisInput) {
  const analysisByUrl = new Map(
    input.analyses.map((analysis) => [analysis.productUrl, analysis]),
  );
  const pairs = input.rankedResults.flatMap((result) => {
    const analysis = analysisByUrl.get(result.productUrl);
    if (!analysis) return [];
    const productForm = evaluateTajaProductForm(input.productQuery, result);
    const priceSignal = evaluateTajaPriceSignal(
      result,
      comparableResults(productForm, input.rankedResults, input.productQuery),
    );
    return [{
      result,
      analysis: adjustedAnalysis({ analysis, result, productForm, priceSignal }),
      originalRank: analysis.rank,
    }];
  });

  pairs.sort((left, right) =>
    tajaProductFormRank(left.analysis.productForm.matchStatus) -
      tajaProductFormRank(right.analysis.productForm.matchStatus) ||
    left.originalRank - right.originalRank,
  );

  return {
    rankedResults: pairs.map((pair) => pair.result),
    analyses: pairs.map((pair, index) => ({
      ...pair.analysis,
      rank: index + 1,
    })),
  };
}
