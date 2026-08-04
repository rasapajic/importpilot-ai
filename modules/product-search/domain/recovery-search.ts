export const RECOVERY_SEARCH_EVENT = "importpilot:recovery-search" as const;

export type RecoverySearchCriteria = {
  maxUnitPrice: string;
  currency: string;
  strictPriceLimit: true;
};

export function createRecoverySearchCriteria(
  maxUnitPrice: string | number | { toString(): string },
  currency: string,
): RecoverySearchCriteria | null {
  const numericPrice = Number(maxUnitPrice.toString());
  const normalizedCurrency = currency.trim().toUpperCase();

  if (!Number.isFinite(numericPrice) || numericPrice <= 0) return null;
  if (!/^[A-Z]{3}$/.test(normalizedCurrency)) return null;

  return {
    maxUnitPrice: numericPrice.toFixed(2),
    currency: normalizedCurrency,
    strictPriceLimit: true,
  };
}

export function readRecoverySearchCriteria(value: unknown): RecoverySearchCriteria | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  return createRecoverySearchCriteria(
    typeof record.maxUnitPrice === "string" || typeof record.maxUnitPrice === "number"
      ? record.maxUnitPrice
      : "",
    typeof record.currency === "string" ? record.currency : "",
  );
}
