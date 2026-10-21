import type { SupplierOfferSearchResult } from "./search";
import { isPartialLunaSearchResult } from "./luna-search-plan";
import {
  evaluateTajaProductForm,
  sameTajaPriceComparisonGroup,
  tajaProductFormRank,
} from "./taja-product-form";
import { evaluateTajaRequirementMatch } from "./taja-requirement-match";
import { assessSupplierOfferQuantityPrice } from "./supplier-quantity-pricing";

type PreliminaryRankingContext = {
  quantity: number;
  productQuery?: string;
};

function comparableResults(
  result: SupplierOfferSearchResult,
  results: SupplierOfferSearchResult[],
  productQuery?: string,
) {
  if (!productQuery) return results;
  const form = evaluateTajaProductForm(productQuery, result);
  return results.filter((candidate) =>
    sameTajaPriceComparisonGroup(
      form,
      evaluateTajaProductForm(productQuery, candidate),
    ),
  );
}

function confirmedUnitPrice(
  result: SupplierOfferSearchResult,
  quantity: number,
) {
  const pricing = assessSupplierOfferQuantityPrice(result, quantity);
  return pricing.procurementCostConfirmed ? pricing.quantityUnitPrice : null;
}

function priceCompetitiveness(
  result: SupplierOfferSearchResult,
  results: SupplierOfferSearchResult[],
  quantity: number,
  productQuery?: string,
) {
  const price = confirmedUnitPrice(result, quantity);
  if (price === null || result.currency === null) return 0;

  const comparablePrices = comparableResults(result, results, productQuery)
    .flatMap((candidate) => {
      if (candidate.currency !== result.currency) return [];
      const candidatePrice = confirmedUnitPrice(candidate, quantity);
      return candidatePrice === null ? [] : [candidatePrice];
    })
    .sort((left, right) => left - right);

  if (comparablePrices.length <= 1) return 10;
  const position = comparablePrices.findIndex((candidatePrice) => candidatePrice >= price);
  const normalizedPosition = position < 0 ? comparablePrices.length - 1 : position;
  return Math.round(20 * (1 - normalizedPosition / (comparablePrices.length - 1)));
}

function preliminaryScore(
  result: SupplierOfferSearchResult,
  results: SupplierOfferSearchResult[],
  context: PreliminaryRankingContext,
) {
  let score = priceCompetitiveness(
    result,
    results,
    context.quantity,
    context.productQuery,
  );

  if (confirmedUnitPrice(result, context.quantity) !== null) score += 20;

  if (result.minimumOrderQuantity !== null) {
    // A known MOQ above the requested quantity is a hard commercial mismatch,
    // not a small data-quality disadvantage. It must not be hidden by a low
    // displayed unit price or otherwise complete marketplace metadata.
    score += result.minimumOrderQuantity <= context.quantity ? 25 : -100;
  }

  if (result.incoterm !== null) score += 15;
  if (result.supplierCountry !== null) score += 5;
  if (result.imageUrl !== null) score += 15;
  if (!isPartialLunaSearchResult(result)) score += 10;
  if (context.productQuery) {
    score += evaluateTajaRequirementMatch(
      context.productQuery,
      result,
    ).scoreAdjustment;
    score += evaluateTajaProductForm(
      context.productQuery,
      result,
    ).scoreAdjustment;
  }

  return score;
}

/**
 * Produces a transparent first-pass ordering from fields already verified on
 * supplier pages. When the user requests a complete system, compatible systems
 * are ordered before unclear offers, while pumps, nozzles and other components
 * are kept out of the finalist enrichment budget. Prices are compared only
 * inside compatible product-form groups. A known MOQ conflict remains blocking.
 * Final landed-cost, supplier-risk and compliance verification happen later.
 */
export function rankPreliminarySupplierOffers(
  results: SupplierOfferSearchResult[],
  context: PreliminaryRankingContext,
) {
  return results
    .map((result, originalIndex) => {
      const productForm = context.productQuery
        ? evaluateTajaProductForm(context.productQuery, result)
        : null;
      return {
        result,
        originalIndex,
        productFormRank: productForm
          ? tajaProductFormRank(productForm.matchStatus)
          : 0,
        score: preliminaryScore(result, results, context),
      };
    })
    .sort((left, right) =>
      left.productFormRank - right.productFormRank ||
      right.score - left.score ||
      left.originalIndex - right.originalIndex,
    )
    .map(({ result }) => result);
}
