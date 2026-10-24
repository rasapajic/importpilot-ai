type Amount = { toString(): string } | string | number | null | undefined;

function normalizedAmount(value: Amount) {
  if (value === null || value === undefined) return null;
  const numeric = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(numeric) ? numeric.toFixed(4) : null;
}

export function calculationMatchesOfferPrice(
  calculation: { unitPrice: { toString(): string } | string | number; currency: string },
  offer: { unitPrice: Amount; currency: string | null },
) {
  const calculationPrice = normalizedAmount(calculation.unitPrice);
  const offerPrice = normalizedAmount(offer.unitPrice);
  return calculationPrice !== null
    && offerPrice !== null
    && calculationPrice === offerPrice
    && Boolean(offer.currency)
    && calculation.currency === offer.currency;
}

export function latestCalculationIfCurrent<T extends {
  unitPrice: { toString(): string } | string | number;
  currency: string;
}>(
  calculationsNewestFirst: readonly T[],
  offer: { unitPrice: Amount; currency: string | null },
) {
  const latest = calculationsNewestFirst[0];
  if (!latest || !calculationMatchesOfferPrice(latest, offer)) return null;
  return latest;
}

export function offerPriceChanged(
  current: { unitPrice: Amount; currency: string | null },
  next: { unitPrice: string; currency: string },
) {
  return !calculationMatchesOfferPrice(next, current);
}
