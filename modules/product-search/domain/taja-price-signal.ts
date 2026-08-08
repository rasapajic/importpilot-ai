import type { SupplierOfferSearchResult } from "./search";

export const TajaPriceSignalStatuses = {
  UNAVAILABLE: "UNAVAILABLE",
  NORMAL: "NORMAL",
  HIGH_OUTLIER: "HIGH_OUTLIER",
  LOW_OUTLIER: "LOW_OUTLIER",
} as const;

export type TajaPriceSignalStatus =
  (typeof TajaPriceSignalStatuses)[keyof typeof TajaPriceSignalStatuses];

export type TajaPriceSignal = {
  status: TajaPriceSignalStatus;
  price: number | null;
  currency: string | null;
  comparableCount: number;
  medianPrice: number | null;
  ratioToMedian: number | null;
  scoreAdjustment: number;
};

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? null;
  const left = sorted[middle - 1];
  const right = sorted[middle];
  return left === undefined || right === undefined ? null : (left + right) / 2;
}

/**
 * Flags only extreme same-currency deviations. It does not claim that the
 * price is wrong; it marks the unit basis for verification before TAJA can
 * treat the offer as final.
 */
export function evaluateTajaPriceSignal(
  result: SupplierOfferSearchResult,
  candidates: SupplierOfferSearchResult[],
): TajaPriceSignal {
  if (result.price === null || result.currency === null || result.price <= 0) {
    return {
      status: TajaPriceSignalStatuses.UNAVAILABLE,
      price: result.price,
      currency: result.currency,
      comparableCount: 0,
      medianPrice: null,
      ratioToMedian: null,
      scoreAdjustment: 0,
    };
  }

  const comparablePrices = candidates.flatMap((candidate) =>
    candidate.currency === result.currency &&
    candidate.price !== null &&
    candidate.price > 0
      ? [candidate.price]
      : [],
  );
  const medianPrice = median(comparablePrices);
  if (comparablePrices.length < 3 || medianPrice === null || medianPrice <= 0) {
    return {
      status: TajaPriceSignalStatuses.UNAVAILABLE,
      price: result.price,
      currency: result.currency,
      comparableCount: comparablePrices.length,
      medianPrice,
      ratioToMedian: null,
      scoreAdjustment: 0,
    };
  }

  const ratioToMedian = result.price / medianPrice;
  if (ratioToMedian >= 5) {
    return {
      status: TajaPriceSignalStatuses.HIGH_OUTLIER,
      price: result.price,
      currency: result.currency,
      comparableCount: comparablePrices.length,
      medianPrice,
      ratioToMedian,
      scoreAdjustment: -20,
    };
  }
  if (ratioToMedian <= 0.1) {
    return {
      status: TajaPriceSignalStatuses.LOW_OUTLIER,
      price: result.price,
      currency: result.currency,
      comparableCount: comparablePrices.length,
      medianPrice,
      ratioToMedian,
      scoreAdjustment: -12,
    };
  }

  return {
    status: TajaPriceSignalStatuses.NORMAL,
    price: result.price,
    currency: result.currency,
    comparableCount: comparablePrices.length,
    medianPrice,
    ratioToMedian,
    scoreAdjustment: 0,
  };
}

export function tajaPriceSignalRank(status: TajaPriceSignalStatus) {
  if (status === TajaPriceSignalStatuses.NORMAL) return 0;
  if (status === TajaPriceSignalStatuses.UNAVAILABLE) return 1;
  return 2;
}
