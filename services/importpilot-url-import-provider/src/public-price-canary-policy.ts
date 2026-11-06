import { exactMadeInChinaProductIdentity } from "./marketplace-price-source-parser.js";
import type {
  CorroboratedAdvertisedRange,
} from "./marketplace-price-evidence.js";
import type {
  SingleCatalogAdvertisedRange,
} from "./marketplace-price-source-reader.js";

export type PublicPriceEvidence =
  | CorroboratedAdvertisedRange
  | SingleCatalogAdvertisedRange;

export type PublicPriceCanaryGate = {
  eligible(productUrl: string): boolean;
  getOrRead(
    productUrl: string,
    loader: () => Promise<PublicPriceEvidence | null>,
  ): Promise<PublicPriceEvidence | null>;
};

export type CanaryPolicyOptions = {
  enabled: boolean;
  canaryProductUrl?: string | null;
  now?: () => number;
  // Bounded in memory: at most one pair of secondary GETs each 10 minutes
  // per service instance, including unsuccessful reads and concurrent requests.
  intervalMs?: number;
};

const MIN_INTERVAL_MS = 10 * 60 * 1000;

/**
 * Conservative shared-provider rollout: no extra catalog/video traffic at all
 * unless both the server feature flag and an exact, valid product URL canary
 * are configured. A single-flight cache caps reads for even a busy canary.
 *
 * The cache is per service instance and intentionally never persisted.
 * Cached data is still an unconfirmed public listing, never a supplier quote.
 */
export function createPublicPriceCanaryGate(
  options: CanaryPolicyOptions,
): PublicPriceCanaryGate {
  const canary = options.canaryProductUrl?.trim() ?? "";
  const validCanary = exactMadeInChinaProductIdentity(canary);
  const permitted = Boolean(options.enabled && validCanary && validCanary.productUrl === canary);
  const now = options.now ?? Date.now;
  const intervalMs = Math.max(MIN_INTERVAL_MS, options.intervalMs ?? MIN_INTERVAL_MS);
  let lastAttempt: number | null = null;
  let cached: PublicPriceEvidence | null = null;
  let inFlight: Promise<PublicPriceEvidence | null> | null = null;

  return {
    eligible(productUrl) {
      return permitted && productUrl === canary;
    },
    async getOrRead(productUrl, loader) {
      if (!permitted || productUrl !== canary) return null;
      if (inFlight) return inFlight;
      const timestamp = now();
      if (lastAttempt !== null && timestamp - lastAttempt < intervalMs) {
        return cached;
      }
      // Reserve the whole interval BEFORE an outbound request begins.
      // A failure/HTTP 403 also consumes the quota. Never retry in a loop.
      lastAttempt = timestamp;
      inFlight = Promise.resolve()
        .then(loader)
        .then(
          (value) => {
            // No unrelated SKU can poison this cache even if a caller errs.
            cached = value?.productUrl === canary ? value : null;
            return cached;
          },
          () => {
            cached = null;
            return null;
          },
        )
        .finally(() => {
          inFlight = null;
        });
      return inFlight;
    },
  };
}
