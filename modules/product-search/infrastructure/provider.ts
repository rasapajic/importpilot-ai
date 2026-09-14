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

type SupplierProviderEnvironment = {
  SUPPLIER_SEARCH_PROVIDER_BASE_URL?: string;
  SUPPLIER_SEARCH_PROVIDER_URL?: string;
  SUPPLIER_SEARCH_PROVIDER_HEALTH_URL?: string;
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

export function resolveSupplierProviderEndpoints(
  environment?: SupplierProviderEnvironment,
) {
  const resolvedEnvironment = environment ?? {
    SUPPLIER_SEARCH_PROVIDER_BASE_URL: process.env.SUPPLIER_SEARCH_PROVIDER_BASE_URL,
    SUPPLIER_SEARCH_PROVIDER_URL: process.env.SUPPLIER_SEARCH_PROVIDER_URL,
    SUPPLIER_SEARCH_PROVIDER_HEALTH_URL: process.env.SUPPLIER_SEARCH_PROVIDER_HEALTH_URL,
  };
  const baseUrl = resolvedEnvironment.SUPPLIER_SEARCH_PROVIDER_BASE_URL
    ?.trim()
    .replace(/\/+$/, "");

  return {
    endpoint:
      resolvedEnvironment.SUPPLIER_SEARCH_PROVIDER_URL?.trim() ||
      (baseUrl ? `${baseUrl}/search` : undefined),
    healthEndpoint:
      resolvedEnvironment.SUPPLIER_SEARCH_PROVIDER_HEALTH_URL?.trim() ||
      (baseUrl ? `${baseUrl}/health` : undefined),
  };
}

export function getSupplierOfferSearchProvider(
  options: SupplierProviderOptions = {},
): SupplierOfferSearchProvider {
  const { endpoint, healthEndpoint } = resolveSupplierProviderEndpoints();
  if (!endpoint) return unconfiguredSupplierOfferSearchProvider;

  return createHttpSupplierOfferSearchProvider({
    endpoint,
    healthEndpoint,
    token: process.env.SUPPLIER_SEARCH_PROVIDER_TOKEN,
    timeoutMs: boundedProviderTimeout(process.env.SUPPLIER_SEARCH_PROVIDER_TIMEOUT_MS),
    maxAttempts: Number(process.env.SUPPLIER_SEARCH_PROVIDER_MAX_ATTEMPTS ?? 1),
    allowInsecureLocalhost: process.env.NODE_ENV === "development",
    onAiUsage: options.onAiUsage,
  });
}

export type SupplierSearchProviderStatus = "connected" | "not_configured" | "error";

export async function getSupplierSearchProviderStatus(): Promise<SupplierSearchProviderStatus> {
  const { endpoint } = resolveSupplierProviderEndpoints();
  if (!endpoint) return "not_configured";
  try {
    return await getSupplierOfferSearchProvider().healthCheck?.() ? "connected" : "error";
  } catch {
    return "error";
  }
}
