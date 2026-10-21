import {
  SupplierSearchProviderError,
  SupplierSearchProviderHttpError,
  SupplierSearchProviderInvalidResponseError,
  SupplierSearchProviderResponseTooLargeError,
  SupplierSearchProviderTimeoutError,
} from "./http-provider";

/**
 * Safe provider-failure class. It carries no URL, token, query, or response body.
 * Production logs were previously silent, so 401, 404, and network failures
 * looked identical to the staging client.
 */
export type SupplierSearchProviderFailureCode =
  | "auth"
  | "not_found"
  | "network"
  | "invalid_response"
  | "timeout"
  | "http_error"
  | "configuration";

export type SupplierSearchProviderFailure = {
  providerFailure: SupplierSearchProviderFailureCode;
  providerHttpStatus: number | null;
};

export function classifySupplierSearchProviderFailure(
  error: unknown,
): SupplierSearchProviderFailure {
  if (error instanceof SupplierSearchProviderTimeoutError) {
    return { providerFailure: "timeout", providerHttpStatus: null };
  }
  if (error instanceof SupplierSearchProviderHttpError) {
    if (error.status === 401 || error.status === 403) {
      return { providerFailure: "auth", providerHttpStatus: error.status };
    }
    if (error.status === 404) {
      return { providerFailure: "not_found", providerHttpStatus: error.status };
    }
    return { providerFailure: "http_error", providerHttpStatus: error.status };
  }
  if (
    error instanceof SupplierSearchProviderInvalidResponseError ||
    error instanceof SupplierSearchProviderResponseTooLargeError
  ) {
    return { providerFailure: "invalid_response", providerHttpStatus: null };
  }
  if (
    error instanceof SupplierSearchProviderError &&
    error.message.includes("must use HTTPS")
  ) {
    return { providerFailure: "configuration", providerHttpStatus: null };
  }
  return { providerFailure: "network", providerHttpStatus: null };
}

export function supplierSearchProviderFailureLog(input: {
  durationMs: number;
  error: unknown;
}) {
  const failure = classifySupplierSearchProviderFailure(input.error);
  return {
    service: "importpilot-app",
    event: "supplier_search_provider_failure",
    duration_ms: input.durationMs,
    provider_failure: failure.providerFailure,
    provider_http_status: failure.providerHttpStatus,
  };
}
