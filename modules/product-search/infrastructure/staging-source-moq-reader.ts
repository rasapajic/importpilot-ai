import type { SupplierOfferUrlImportProvider } from "../domain/search";
import { exactProductPageIdentity } from "../domain/source-moq-reconciliation";
import {
  createSupplierOfferUrlImportProvider,
  UrlImportFetchError,
} from "./url-import-provider";

/**
 * Acceptance-only reader for the exact SKU in #187. This is NOT a fallback
 * enabled for normal searches or production traffic. It cannot be toggled
 * from the browser: Render service ID and a separately approved server env
 * setting are both required. No credentials or supplier API are used.
 */
export const JAKOV360_ACCEPTANCE_RENDER_SERVICE_ID = "srv-datu3v093c1s73c17m60";
export const DILICN_187_EXACT_PRODUCT_URL =
  "https://dilicn.en.made-in-china.com/product/jYzpeDtbEMkd/China-New-Model-Senior-Reading-Glasses-High-Definition-Wholesale-From-Manufacturers-Direct-Sales-.html";

export function shouldUseAcceptanceLocalMoqReader(input: {
  serviceId?: string | null;
  enabled?: string | null;
  sourceMoqCheck: boolean;
  productUrl: string;
}): boolean {
  return input.serviceId === JAKOV360_ACCEPTANCE_RENDER_SERVICE_ID &&
    input.enabled === "1" &&
    input.sourceMoqCheck === true &&
    exactProductPageIdentity(input.productUrl) ===
      exactProductPageIdentity(DILICN_187_EXACT_PRODUCT_URL);
}

/**
 * Reuse bounded local HTML parser, DNS/private-host checks and 20s timeout.
 * Enforce no redirects, including cross-host redirects, and verify the actual
 * response URL before interpreting any source data as an exact-SKU reading.
 * Failures stay unverified rather than falling back to the shared provider.
 */
export function createAcceptanceLocalMoqReader(options: {
  fetcher?: typeof fetch;
  resolveHost?: (host: string) => Promise<string[]>;
} = {}): SupplierOfferUrlImportProvider {
  const fetcher = options.fetcher ?? fetch;
  return createSupplierOfferUrlImportProvider({
    requireVisibleListingMoq: true,
    resolveHost: options.resolveHost,
    fetcher: async (input, init) => {
      const requested = typeof input === "string" ? input : input.toString();
      const response = await fetcher(input, { ...init, redirect: "manual" });
      const expected = exactProductPageIdentity(requested);
      const actual = response.url ? exactProductPageIdentity(response.url) : null;
      if (
        !expected ||
        expected !== exactProductPageIdentity(DILICN_187_EXACT_PRODUCT_URL) ||
        !actual ||
        actual !== expected ||
        response.redirected ||
        (response.status >= 300 && response.status < 400)
      ) {
        throw new UrlImportFetchError("Exact source URL was not verified; redirects are not accepted.");
      }
      return response;
    },
  });
}
