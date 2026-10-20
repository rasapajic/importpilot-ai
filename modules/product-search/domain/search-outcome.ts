export type SupplierSearchDisposition = "live" | "cache" | "failed";

export type SupplierSearchFailureCode =
  | "timeout"
  | "provider_error"
  | "no_verified_offers";

export type SupplierSearchOutcomeClassification = {
  searchDisposition: SupplierSearchDisposition;
  failureCode: SupplierSearchFailureCode | null;
};

/**
 * Live results, saved results, and failed searches stay distinct.
 * A cache hit after a failed live attempt is still cache: the saved offers
 * must not be described as a new search. An empty or timed-out attempt with
 * nothing saved is a failure, not a successful list of offers.
 */
export function classifySupplierSearchOutcome(input: {
  resultOrigin: "live" | "cache" | null;
  liveProviderFailed: boolean;
  returnedFromCache: boolean;
  resultCount: number;
  failureCode?: SupplierSearchFailureCode | null;
}): SupplierSearchOutcomeClassification {
  if (input.returnedFromCache || input.resultOrigin === "cache") {
    return {
      searchDisposition: "cache",
      failureCode: input.liveProviderFailed
        ? input.failureCode ?? "provider_error"
        : null,
    };
  }

  if (
    input.resultOrigin === "live" &&
    !input.liveProviderFailed &&
    input.resultCount > 0
  ) {
    return { searchDisposition: "live", failureCode: null };
  }

  return {
    searchDisposition: "failed",
    failureCode: input.failureCode ?? "no_verified_offers",
  };
}

/** Only a live result set spends a monthly or one-off live-search credit. */
export function supplierSearchConsumesLiveQuota(input: {
  searchDisposition: SupplierSearchDisposition;
}) {
  return input.searchDisposition === "live";
}
