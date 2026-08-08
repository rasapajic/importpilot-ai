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

export function getSupplierOfferSearchProvider(
  options: SupplierProviderOptions = {},
): SupplierOfferSearchProvider {
  const endpoint = process.env.SUPPLIER_SEARCH_PROVIDER_URL;
  if (!endpoint) return unconfiguredSupplierOfferSearchProvider;

  return createHttpSupplierOfferSearchProvider({
    endpoint,
    healthEndpoint: process.env.SUPPLIER_SEARCH_PROVIDER_HEALTH_URL,
    token: process.env.SUPPLIER_SEARCH_PROVIDER_TOKEN,
    timeoutMs: Number(
      process.env.SUPPLIER_SEARCH_PROVIDER_TIMEOUT_MS ?? SUPPLIER_SEARCH_TIMEOUT_MS,
    ),
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
