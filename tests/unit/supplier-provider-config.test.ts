import { describe, expect, it } from "vitest";

import { resolveSupplierProviderEndpoints } from "../../modules/product-search/infrastructure/provider";

describe("supplier provider endpoint resolution", () => {
  it("derives search and health endpoints from a Render base URL", () => {
    expect(resolveSupplierProviderEndpoints({
      SUPPLIER_SEARCH_PROVIDER_BASE_URL: "https://provider.example/",
    })).toEqual({
      endpoint: "https://provider.example/search",
      voiceEndpoint: "https://provider.example/voice-intake",
      healthEndpoint: "https://provider.example/health",
    });
  });

  it("keeps explicit endpoints authoritative for existing deployments", () => {
    expect(resolveSupplierProviderEndpoints({
      SUPPLIER_SEARCH_PROVIDER_BASE_URL: "https://base.example",
      SUPPLIER_SEARCH_PROVIDER_URL: "https://search.example/custom-search",
      SUPPLIER_SEARCH_PROVIDER_HEALTH_URL: "https://health.example/custom-health",
    })).toEqual({
      endpoint: "https://search.example/custom-search",
      voiceEndpoint: "https://base.example/voice-intake",
      healthEndpoint: "https://health.example/custom-health",
    });
  });

  it("reports no provider when neither explicit nor base URL is configured", () => {
    expect(resolveSupplierProviderEndpoints({})).toEqual({
      endpoint: undefined,
      voiceEndpoint: undefined,
      healthEndpoint: undefined,
    });
  });
});
