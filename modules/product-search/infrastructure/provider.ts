import type { AiUsageEvent } from "../../ai-usage/domain/ai-usage";
import type { SupplierOfferSearchProvider } from "../domain/search";
import {
  createHttpSupplierOfferSearchProvider,
  SUPPLIER_SEARCH_TIMEOUT_MS,
} from "./http-provider";
import { unconfiguredSupplierOfferSearchProvider } from "./unconfigured-provider";

type SupplierProviderOptions = {
  onAiUsage?: (events: AiUsageEvent[]) => Promise<void> | void;
};

export const SUPPLIER_SEARCH_APP_PROVIDER_HARD_TIMEOUT_MS = 55_000;

function boundedProviderTimeout(value: string | undefined) {
  const parsed = Number(value ?? SUPPLIER_SEARCH_TIMEOUT_MS);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return SUPPLIER_SEARCH_APP_PROVIDER_HARD_TIMEOUT_MS;
  }
  return Math.max(
    1_000,
    Math.min(SUPPLIER_SEARCH_APP_PROVIDER_HARD_TIMEOUT_MS, Math.trunc(parsed)),
  );
}

export function getSupplierOfferSearchProvider(
  options: SupplierProviderOptions = {},
): SupplierOfferSearchProvider {
  const endpoint = process.env.SUPPLIER_SEARCH_PROVIDER_URL;
  if (!endpoint) return unconfiguredSupplierOfferSearchProvider;

  return createHttpSupplierOfferSearchProvider({
    endpoint,
    healthEndpoint: process.env.SUPPLIER_SEARCH_PROVIDER_HEALTH_URL,
    token: process.env.SUPPLIER_SEARCH_PROVIDER_TOKEN,
    timeoutMs: boundedProviderTimeout(process.env.SUPPLIER_SEARCH_PROVIDER_TIMEOUT_MS),
    maxAttempts: Number(process.env.SUPPLIER_SEARCH_PROVIDER_MAX_ATTEMPTS ?? 1),
    allowInsecureLocalhost: process.env.NODE_ENV === "development",
    onAiUsage: options.onAiUsage,
  });
}

export type SupplierSearchProviderStatus = "connected" | "not_configured" | "error";

export async function getSupplierSearchProviderStatus(): Promise<SupplierSearchProviderStatus> {
  if (!process.env.SUPPLIER_SEARCH_PROVIDER_URL) return "not_configured";
  try {
    return await getSupplierOfferSearchProvider().healthCheck?.() ? "connected" : "error";
  } catch {
    return "error";
  }
}