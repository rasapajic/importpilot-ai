import type { SupplierOfferSearchProvider } from "../domain/search";
import { createHttpSupplierOfferSearchProvider } from "./http-provider";
import { unconfiguredSupplierOfferSearchProvider } from "./unconfigured-provider";

export function getSupplierOfferSearchProvider(): SupplierOfferSearchProvider {
  const endpoint = process.env.SUPPLIER_SEARCH_PROVIDER_URL;
  if (!endpoint) return unconfiguredSupplierOfferSearchProvider;

  return createHttpSupplierOfferSearchProvider({
    endpoint,
    healthEndpoint: process.env.SUPPLIER_SEARCH_PROVIDER_HEALTH_URL,
    token: process.env.SUPPLIER_SEARCH_PROVIDER_TOKEN,
    allowInsecureLocalhost: process.env.NODE_ENV === "development",
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
