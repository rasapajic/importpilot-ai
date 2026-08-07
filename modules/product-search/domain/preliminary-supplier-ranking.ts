import type { SupplierOfferSearchResult } from "./search";
import { isPartialLunaSearchResult } from "./luna-search-plan";
import { evaluateTajaRequirementMatch } from "./taja-requirement-match";

type PreliminaryRankingContext = {
  quantity: number;
  productQuery?: string;
};

function priceCompetitiveness(
  result: SupplierOfferSearchResult,
  results: SupplierOfferSearchResult[],
) {
  if (result.price === null || result.currency === null) return 0;

  const comparablePrices = results
    .filter((candidate) =>
      candidate.price !== null && candidate.currency === result.currency,
    )
    .map((candidate) => candidate.price as number)
    .sort((left, right) => left - right);

  if (comparablePrices.length <= 1) return 10;
  const position = comparablePrices.findIndex((price) => price >= result.price!);
  const normalizedPosition = position < 0 ? comparablePrices.length - 1 : position;
  return Math.round(20 * (1 - normalizedPosition / (comparablePrices.length - 1)));
}

function preliminaryScore(
  result: SupplierOfferSearchResult,
  results: SupplierOfferSearchResult[],
  context: PreliminaryRankingContext,
) {
  let score = priceCompetitiveness(result, results);

  if (result.price !== null && result.currency !== null) score += 20;

  if (result.minimumOrderQuantity !== null) {
    // A known MOQ above the requested quantity is a hard commercial mismatch,
    // not a small data-quality disadvantage. It must not be hidden by a low
    // displayed unit price or otherwise complete marketplace metadata.
    score += result.minimumOrderQuantity <= context.quantity ? 25 : -100;
  }

  if (result.incoterm !== null) score += 15;
  if (result.supplierCountry !== null) score += 5;
  if (result.imageUrl !== null) score += 5;
  if (!isPartialLunaSearchResult(result)) score += 10;
  if (context.productQuery) {
    score += evaluateTajaRequirementMatch(
      context.productQuery,
      result,
    ).scoreAdjustment;
  }

  return score;
}

/**
 * Produces a transparent first-pass ordering from fields already verified on
 * supplier pages. Product requirements from the user's query may adjust this
 * first pass, but unconfirmed details are never treated as false. A known MOQ
 * conflict is treated as blocking because the displayed price may not apply to
 * the user's requested quantity. This is not the final TAJA ranking: landed
 * cost, supplier-risk verification, compliance and supplier replies belong to
 * the later deep-analysis stage.
 */
export function rankPreliminarySupplierOffers(
  results: SupplierOfferSearchResult[],
  context: PreliminaryRankingContext,
) {
  return results
    .map((result, originalIndex) => ({
      result,
      originalIndex,
      score: preliminaryScore(result, results, context),
    }))
    .sort((left, right) =>
      right.score - left.score || left.originalIndex - right.originalIndex,
    )
    .map(({ result }) => result);
}
