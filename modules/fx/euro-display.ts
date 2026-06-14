export type FxSnapshot = {
  baseCurrency: "EUR";
  ratesToEur: Readonly<Record<string, number>>;
  source: string;
  timestamp: string;
};

export const DEFAULT_EUR_FX_SNAPSHOT: FxSnapshot = {
  baseCurrency: "EUR",
  ratesToEur: {
    EUR: 1,
    USD: 0.92,
    CNY: 0.128,
    GBP: 1.18,
  },
  source: "ImportPilot MVP reference rates",
  timestamp: "2026-06-14T00:00:00.000Z",
};

export function convertToEur(
  value: number | string | { toString(): string },
  currency: string | null,
  snapshot: FxSnapshot = DEFAULT_EUR_FX_SNAPSHOT,
) {
  if (!currency) return null;
  const rate = snapshot.ratesToEur[currency.toUpperCase()];
  const numericValue = Number(value.toString());
  if (!Number.isFinite(numericValue) || !Number.isFinite(rate)) return null;
  return numericValue * rate;
}

export function formatCurrency(value: number) {
  return value.toFixed(2);
}

export function getEuroDisplay(
  value: number | string | { toString(): string },
  currency: string | null,
  snapshot: FxSnapshot = DEFAULT_EUR_FX_SNAPSHOT,
) {
  const originalValue = Number(value.toString());
  const eurValue = convertToEur(value, currency, snapshot);
  return {
    original: Number.isFinite(originalValue) && currency
      ? `${formatCurrency(originalValue)} ${currency}`
      : null,
    eur: eurValue === null ? null : `${formatCurrency(eurValue)} EUR`,
    converted: eurValue !== null && currency !== "EUR",
  };
}
