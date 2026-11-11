import { exactMadeInChinaProductIdentity } from "./marketplace-price-source-parser.js";
import type { CorroboratedAdvertisedRange } from "./marketplace-price-evidence.js";
import type { SingleCatalogAdvertisedRange, SellerCatalogFaqMoqConflict } from "./marketplace-price-source-reader.js";

export type PublicPriceEvidence =
  | CorroboratedAdvertisedRange
  | SingleCatalogAdvertisedRange
  | SellerCatalogFaqMoqConflict;

export type PublicPriceGateEvent = {
  // No product URL, seller, SKU, price, credentials or source page content.
  event: "public_price_source_gate";
  outcome:
    | "attempt_started"
    | "catalog_only"
    | "catalog_moq_conflict"
    | "two_listings"
    | "no_evidence"
    | "request_failed"
    | "global_budget_exhausted"
    | "global_request_busy";
  // Cap is PER PROCESS, not an account/global-cluster quota.
  pairBudgetPerTenMinutes: 2;
};

export type PublicPriceGateStatus = {
  enabled: boolean;
  configurationValid: boolean;
  allowedProducts: number;
  maxProducts: 3;
  maxPairsPerTenMinutesPerInstance: 2;
  attemptsInCurrentWindow: number;
  inFlight: boolean;
};

export type PublicPriceCanaryGate = {
  eligible(productUrl: string): boolean;
  /** Configured optional SKU needs proof EVEN IF source reading is disabled. */
  additionalSkuNeedsSourceProof(productUrl: string): boolean;
  /** Every configured exact canary, including the original, needs safe FAQ handling. */
  configuredSkuNeedsFaqReview(productUrl: string): boolean;
  getOrRead(
    productUrl: string,
    loader: () => Promise<PublicPriceEvidence | null>,
  ): Promise<PublicPriceEvidence | null>;
  status(): PublicPriceGateStatus;
};

export type CanaryPolicyOptions = {
  enabled: boolean;
  canaryProductUrl?: string | null;
  /**
   * OPTIONAL future expansion: JSON array of at most TWO additional exact
   * Made-in-China SKU URLs. Empty/unset => only existing Pilot Optics canary.
   * Any malformed/duplicate/untrusted entry FAILS CLOSED for the whole gate.
   */
  additionalProductUrlsJson?: string | null;
  now?: () => number;
  intervalMs?: number;
  onEvent?: (event: PublicPriceGateEvent) => void;
};

const MIN_INTERVAL_MS = 10 * 60 * 1000;
const MAX_PRODUCTS = 3;
const MAX_PAIRS_PER_WINDOW = 2;
const MAX_EXTRA_PRODUCTS = MAX_PRODUCTS - 1;

function isExactPublicProductUrl(url: string): boolean {
  const product = exactMadeInChinaProductIdentity(url);
  return Boolean(product && product.productUrl === url && url.length <= 900);
}

function configuredProducts(options: CanaryPolicyOptions): string[] | null {
  const canary = options.canaryProductUrl?.trim() ?? "";
  if (!isExactPublicProductUrl(canary)) return null;

  const raw = options.additionalProductUrlsJson?.trim() ?? "";
  if (!raw) return [canary];
  if (raw.length > 2000) return null;

  let additional: unknown;
  try {
    additional = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (!Array.isArray(additional) || additional.length > MAX_EXTRA_PRODUCTS) return null;
  if (!additional.every((url) => typeof url === "string" && isExactPublicProductUrl(url))) {
    return null;
  }

  const products = [canary, ...additional] as string[];
  // Reject ambiguity rather than silently deduplicating and accidentally
  // permitting a different number of configured products.
  return new Set(products).size === products.length ? products : null;
}

type PerProductState = {
  lastAttempt: number | null;
  cached: PublicPriceEvidence | null;
  inFlight: Promise<PublicPriceEvidence | null> | null;
};

/**
 * Fail-closed public catalog reader gate:
 * - pilot remains the only allowed product until an operator explicitly adds
 *   up to TWO exact SKUs in server-side JSON configuration
 * - one source pair per SKU per >=10 min, including HTTP 403/failures
 * - at most TWO source pairs / 10 min across ALL allowed products on this
 *   process, with at most one pair in flight at a time
 * - concurrent requests for the SAME SKU share one Promise
 * - no persisted cache, URLs or price values in logs
 *
 * The aggregate quota is per Render process/instance. Scaling to multiple
 * instances requires a shared transactional quota before general rollout.
 */
export function createPublicPriceCanaryGate(
  options: CanaryPolicyOptions,
): PublicPriceCanaryGate {
  const products = configuredProducts(options);
  const enabled = options.enabled === true && products !== null;
  const byProduct = new Map<string, PerProductState>(
    (products ?? []).map(url => [url, { lastAttempt: null, cached: null, inFlight: null }]),
  );
  const now = options.now ?? Date.now;
  const intervalMs = Math.max(MIN_INTERVAL_MS, options.intervalMs ?? MIN_INTERVAL_MS);
  let attempts: number[] = [];
  let busy = false;
  let budgetAlertAt: number | null = null;
  let busyAlertAt: number | null = null;

  function emit(outcome: PublicPriceGateEvent["outcome"]) {
    try {
      options.onEvent?.({
        event: "public_price_source_gate",
        outcome,
        pairBudgetPerTenMinutes: MAX_PAIRS_PER_WINDOW,
      });
    } catch {
      // Observability is optional and must never interrupt a product preview.
    }
  }

  function prune(timestamp: number) {
    attempts = attempts.filter(t => timestamp - t < intervalMs);
  }

  return {
    eligible(productUrl) {
      return enabled && byProduct.has(productUrl);
    },
    additionalSkuNeedsSourceProof(productUrl) {
      // Keep fail-closed pricing on extra SKUs when an operator flips the
      // source-reading kill switch OFF; no secondary HTTP GET is authorized.
      return products !== null && productUrl !== products[0] && byProduct.has(productUrl);
    },
    configuredSkuNeedsFaqReview(productUrl) {
      // The first original Pilot SKU must not bypass the commercial firewall.
      // This remains true with source reading OFF: no secondary GET is added.
      return products !== null && byProduct.has(productUrl);
    },
    status() {
      prune(now());
      return {
        enabled,
        configurationValid: products !== null,
        allowedProducts: enabled ? byProduct.size : 0,
        maxProducts: MAX_PRODUCTS,
        maxPairsPerTenMinutesPerInstance: MAX_PAIRS_PER_WINDOW,
        attemptsInCurrentWindow: attempts.length,
        inFlight: busy,
      };
    },
    async getOrRead(productUrl, loader) {
      if (!enabled) return null;
      const entry = byProduct.get(productUrl);
      if (!entry) return null;

      if (entry.inFlight) return entry.inFlight;
      const timestamp = now();
      if (entry.lastAttempt !== null &&
          timestamp - entry.lastAttempt < intervalMs) {
        return entry.cached;
      }

      // Different SKUs must never launch secondary requests concurrently.
      // Do not consume a quota slot for a request that did not start.
      if (busy) {
        if (busyAlertAt === null || timestamp - busyAlertAt >= intervalMs) {
          busyAlertAt = timestamp;
          emit("global_request_busy");
        }
        return null;
      }
      prune(timestamp);
      if (attempts.length >= MAX_PAIRS_PER_WINDOW) {
        if (budgetAlertAt === null || timestamp - budgetAlertAt >= intervalMs) {
          budgetAlertAt = timestamp;
          emit("global_budget_exhausted");
        }
        return null;
      }

      // Reserve both the per-product cooldown and aggregate quota BEFORE
      // executing the reader. A failed source/HTTP 403 also spends the slot.
      entry.lastAttempt = timestamp;
      attempts.push(timestamp);
      busy = true;
      emit("attempt_started");

      entry.inFlight = Promise.resolve().then(loader).then(
        (result) => {
          entry.cached = result?.productUrl === productUrl &&
            result.verifiedQuote === false ? result : null;
          emit(entry.cached?.kind === "SELLER_CATALOG_FAQ_MOQ_CONFLICT"
            ? "catalog_moq_conflict"
            : entry.cached?.kind === "SINGLE_SELLER_CATALOG_ADVERTISED_RANGE"
              ? "catalog_only"
              : entry.cached?.kind === "CORROBORATED_ADVERTISED_RANGE"
                ? "two_listings"
                : "no_evidence");
          return entry.cached;
        },
        () => {
          entry.cached = null;
          emit("request_failed");
          return null;
        },
      ).finally(() => {
        entry.inFlight = null;
        busy = false;
      });
      return entry.inFlight;
    },
  };
}
