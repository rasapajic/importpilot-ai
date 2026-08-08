import { createOpenAiUsageReport, type OpenAiPricingSnapshot } from "./ai-cost.js";
import {
  supplierSearchResultsSchema,
  type AiUsageReport,
  type SearchRequest,
  type SupplierSearchResult,
} from "./contract.js";
import {
  createDevelopmentLogger,
  type DevelopmentLogger,
} from "./development-log.js";
import type {
  SupplierSearchOutcome,
  SupplierSearchSource,
} from "./provider.js";

const DEFAULT_MODEL = "gpt-5-mini";
const DEFAULT_MAX_RESULTS = 3;
const MAX_RESULTS = 10;
const DEFAULT_REQUEST_TIMEOUT_MS = 45_000;
const MIN_REQUEST_TIMEOUT_MS = 5_000;
const MAX_REQUEST_TIMEOUT_MS = 80_000;
const DEFAULT_SEARCH_CONTEXT_SIZE = "low";
const DEFAULT_REASONING_EFFORT = "minimal";

type Fetcher = typeof fetch;
type SearchContextSize = "low" | "medium" | "high";
type ReasoningEffort = "minimal" | "low" | "medium" | "high";
type SearchProfile = "general" | "1688_only";
type ResultUrlPolicy = (productUrl: string) => boolean;

type OpenAIWebSearchOptions = {
  apiKey?: string;
  model?: string;
  maxResults?: number;
  requestTimeoutMs?: number;
  searchContextSize?: SearchContextSize;
  reasoningEffort?: ReasoningEffort;
  pricing?: OpenAiPricingSnapshot;
  fetcher?: Fetcher;
  logger?: DevelopmentLogger;
  now?: () => number;
  searchProfile?: SearchProfile;
  resultUrlPolicy?: ResultUrlPolicy;
};

type UrlCitation = {
  type?: string;
  url?: string;
};

type OutputContent = {
  type?: string;
  text?: string;
  annotations?: UrlCitation[];
};

type OpenAIOutputItem = {
  type?: string;
  action?: {
    sources?: Array<{ type?: string; url?: string }>;
    url?: string;
  };
  content?: OutputContent[];
};

type OpenAIResponse = {
  id?: string;
  status?: string;
  output_text?: string;
  output?: OpenAIOutputItem[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    input_tokens_details?: {
      cached_tokens?: number;
    };
    output_tokens_details?: {
      reasoning_tokens?: number;
    };
  };
  error?: {
    message?: string;
  } | null;
};

type ResultRejectionReason =
  | "INVALID_URL"
  | "NOT_CITED"
  | "DUPLICATE"
  | "NOT_DIRECT_PAGE"
  | "SOURCE_POLICY_REJECTED";

type ResultRejection = {
  reason: ResultRejectionReason;
  url: string;
};

const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] };
const nullableNumber = { anyOf: [{ type: "number" }, { type: "null" }] };
const nullableInteger = { anyOf: [{ type: "integer" }, { type: "null" }] };

const supplierResultsJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    results: {
      type: "array",
      maxItems: MAX_RESULTS,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          supplierName: { type: "string" },
          supplierCountry: nullableString,
          price: nullableNumber,
          currency: nullableString,
          minimumOrderQuantity: nullableInteger,
          incoterm: nullableString,
          productUrl: { type: "string" },
          imageUrl: nullableString,
          source: { type: "string" },
        },
        required: [
          "title",
          "supplierName",
          "supplierCountry",
          "price",
          "currency",
          "minimumOrderQuantity",
          "incoterm",
          "productUrl",
          "imageUrl",
          "source",
        ],
      },
    },
  },
  required: ["results"],
} as const;

function extractOutputText(response: OpenAIResponse) {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text;
  }

  return (response.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((content) => content.type === "output_text" && typeof content.text === "string")
    .map((content) => content.text)
    .join("")
    .trim();
}

function collectCitedUrls(response: OpenAIResponse) {
  const urls = new Set<string>();
  for (const item of response.output ?? []) {
    for (const source of item.action?.sources ?? []) {
      if (source.type === "url" && source.url) urls.add(source.url);
    }
    if (item.action?.url) urls.add(item.action.url);
    for (const content of item.content ?? []) {
      for (const annotation of content.annotations ?? []) {
        if (annotation.type === "url_citation" && annotation.url) {
          urls.add(annotation.url);
        }
      }
    }
  }
  return [...urls];
}

function countWebSearchCalls(response: OpenAIResponse) {
  return (response.output ?? []).filter((item) => item.type === "web_search_call").length;
}

function comparableUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    const path = url.pathname.replace(/\/+$/, "") || "/";
    return `${url.hostname.toLowerCase()}${path}`;
  } catch {
    return null;
  }
}

function diagnosticUrl(value: string) {
  try {
    const url = new URL(value);
    return `${url.hostname.toLowerCase()}${url.pathname}`.slice(0, 300);
  } catch {
    return value.slice(0, 300);
  }
}

function isDirectPage(value: string) {
  try {
    const url = new URL(value);
    const path = url.pathname.toLowerCase();
    if (url.protocol !== "https:" || path === "/" || path === "") return false;
    return ![
      "/search",
      "/search/",
      "/products",
      "/products/",
      "/product-list",
      "/productlist",
      "/category",
    ].some((blocked) => path === blocked || path.startsWith(`${blocked}?`));
  } catch {
    return false;
  }
}

function normalizeResult(result: SupplierSearchResult): SupplierSearchResult {
  const url = new URL(result.productUrl);
  return {
    ...result,
    supplierCountry: result.supplierCountry?.toUpperCase() ?? null,
    currency: result.currency?.toUpperCase() ?? null,
    incoterm: result.incoterm?.toUpperCase() ?? null,
    source: `TAJA web · ${url.hostname.replace(/^www\./, "")}`.slice(0, 100),
  };
}

function keepOnlyCitedResults(
  results: SupplierSearchResult[],
  citedUrls: string[],
  maxResults: number,
  resultUrlPolicy?: ResultUrlPolicy,
) {
  const citationKeys = new Set(
    citedUrls.map(comparableUrl).filter((value): value is string => Boolean(value)),
  );
  const seen = new Set<string>();
  const accepted: SupplierSearchResult[] = [];
  const rejected: ResultRejection[] = [];

  for (const result of results) {
    const key = comparableUrl(result.productUrl);
    let rejectionReason: ResultRejectionReason | null = null;
    if (!key) rejectionReason = "INVALID_URL";
    else if (!citationKeys.has(key)) rejectionReason = "NOT_CITED";
    else if (seen.has(key)) rejectionReason = "DUPLICATE";
    else if (!isDirectPage(result.productUrl)) rejectionReason = "NOT_DIRECT_PAGE";
    else if (resultUrlPolicy && !resultUrlPolicy(result.productUrl)) {
      rejectionReason = "SOURCE_POLICY_REJECTED";
    }

    if (rejectionReason) {
      rejected.push({
        reason: rejectionReason,
        url: diagnosticUrl(result.productUrl),
      });
      continue;
    }

    seen.add(key!);
    accepted.push(normalizeResult(result));
    if (accepted.length >= maxResults) break;
  }

  return { accepted, rejected };
}

function normalizedQueryVariants(input: SearchRequest) {
  const variants = input.queryVariants ?? [];
  return variants.length > 0 ? variants : [input.productQuery];
}

function numberedQueryVariants(input: SearchRequest) {
  return normalizedQueryVariants(input)
    .map((query, index) => `${index + 1}. ${query}`)
    .join("\n");
}

function buildGeneralPrompt(input: SearchRequest, maxResults: number) {
  return [
    "You are TAJA, a rigorous international sourcing analyst.",
    "Use live web search. Do not answer from memory.",
    `The required product specification is represented by these sourcing queries, ordered from most specific to broadest:\n${numberedQueryVariants(input)}`,
    "Execute the query variants in order inside this one research pass.",
    "Do not stop merely because the first query returned generic related products. Continue with the next variant when the direct-page titles do not explicitly confirm the required specifications from the most specific query.",
    `Find up to ${maxResults} current, directly openable supplier product pages. Requested quantity: ${input.quantity}. Import destination: ${input.targetCountry}.`,
    "You may stop early only after the requested number of relevant direct pages is verified and at least one result explicitly confirms all material specifications present in the most specific query. Otherwise exhaust the supplied query variants within the available search budget.",
    "Prioritize manufacturers and B2B suppliers in China and India, including Alibaba, Made-in-China, Global Sources, 1688, IndiaMART, TradeIndia and direct manufacturer websites.",
    "Prefer exact complete kits over generic related products. Keep partially matching pages only after exact variants have been attempted.",
    "Return only direct product-detail pages. Never return a homepage, category page, search-result page, blog post, marketplace editorial page or social-media page.",
    "Every productUrl must be a URL you actually opened or used as a web-search source during this response.",
    "Never invent a supplier, price, currency, MOQ, Incoterm, image URL or product URL.",
    "Commercial details are secondary. Do not perform extra searches solely to find price, MOQ, Incoterm or image data.",
    "Use price and currency only when an explicit numeric unit price is visible on an already opened cited page. Otherwise set both to null.",
    "Use MOQ only when explicitly visible as an integer on an already opened cited page. Otherwise set it to null.",
    "Use Incoterm only when explicitly visible on an already opened cited page. Otherwise set it to null.",
    "Use a two-letter supplier-country code only when confirmed; otherwise null.",
    "Keep the original product title and supplier name from the cited page.",
    "Return an empty results array when no verifiable direct product pages are found.",
  ].join("\n");
}

function build1688OnlyPrompt(input: SearchRequest, maxResults: number) {
  return [
    "You are TAJA's dedicated 1688 sourcing researcher.",
    "Use live web search. Do not answer from memory.",
    "Search 1688.com only. Do not return Alibaba, Made-in-China, Global Sources, IndiaMART, TradeIndia, manufacturer websites or any other domain.",
    `Execute these Chinese 1688 queries in order, from most specific to broadest:\n${numberedQueryVariants(input)}`,
    `Find up to ${maxResults} current product offers for the requested specification. Requested quantity: ${input.quantity}. Import destination: ${input.targetCountry}.`,
    "Do not stop after a generic result. Exhaust the supplied variants unless the requested number of exact direct 1688 offers has been verified.",
    "Every result must be a directly openable HTTPS 1688 offer-detail page on 1688.com or one of its subdomains.",
    "The productUrl path must be exactly /offer/<numeric-id>.htm or /offer/<numeric-id>.html, optionally followed by query parameters.",
    "Never return a 1688 homepage, category page, search-result page, mobile share landing page, login page, shortened redirect, article or supplier storefront.",
    "Every productUrl must be a URL you actually opened or used as a web-search source during this response.",
    "Return the canonical direct offer URL, not a search, share or tracking URL.",
    "Never invent a supplier, price, currency, MOQ, Incoterm, image URL or product URL.",
    "Use price and currency only when an explicit numeric unit price is visible on the cited offer page. Use CNY only when the page explicitly shows yuan/RMB/人民币/¥. Otherwise set both to null.",
    "Use MOQ only when explicitly visible as an integer on the cited offer page. Otherwise set it to null.",
    "Do not treat domestic Chinese delivery terms as an Incoterm. Use Incoterm only when EXW, FCA, FAS, FOB, CFR, CIF, CPT, CIP, DAP, DPU or DDP is explicit.",
    "Use supplier country CN only when the offer page or linked supplier profile confirms China; otherwise null.",
    "Keep the original product title and supplier name from the cited offer page.",
    "Return an empty results array when no verified direct 1688 offer-detail page is found.",
  ].join("\n");
}

function buildPrompt(
  input: SearchRequest,
  maxResults: number,
  searchProfile: SearchProfile,
) {
  return searchProfile === "1688_only"
    ? build1688OnlyPrompt(input, maxResults)
    : buildGeneralPrompt(input, maxResults);
}

function developerInstruction(searchProfile: SearchProfile) {
  return searchProfile === "1688_only"
    ? "Use web search only for exact 1688.com offer-detail pages. Produce source-grounded structured data and return an empty result rather than another marketplace or a non-offer 1688 URL."
    : "Use web search and produce only the requested structured supplier-page data. Prefer exact requirement matching, direct-page verification and source traceability over optional commercial details.";
}

function clampInteger(value: number | undefined, fallback: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.trunc(value!)));
}

function createRequestSignal(parentSignal: AbortSignal, timeoutMs: number) {
  const controller = new AbortController();
  let timedOut = false;

  const abortFromParent = () => controller.abort(parentSignal.reason);
  if (parentSignal.aborted) abortFromParent();
  else parentSignal.addEventListener("abort", abortFromParent, { once: true });

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException("OpenAI web search timed out.", "TimeoutError"));
  }, timeoutMs);

  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    cleanup() {
      clearTimeout(timer);
      parentSignal.removeEventListener("abort", abortFromParent);
    },
  };
}

function buildUsageReport(
  payload: OpenAIResponse,
  model: string,
  durationMs: number,
  pricing: OpenAiPricingSnapshot | undefined,
): AiUsageReport[] {
  if (!payload.id || !payload.usage) return [];
  return [createOpenAiUsageReport({
    model,
    responseId: payload.id,
    inputTokens: payload.usage.input_tokens ?? 0,
    cachedInputTokens: payload.usage.input_tokens_details?.cached_tokens ?? 0,
    outputTokens: payload.usage.output_tokens ?? 0,
    reasoningOutputTokens: payload.usage.output_tokens_details?.reasoning_tokens ?? 0,
    totalTokens: payload.usage.total_tokens ?? 0,
    webSearchCalls: countWebSearchCalls(payload),
    durationMs,
    pricing,
  })];
}

export function createOpenAIWebSearchSource({
  apiKey,
  model = DEFAULT_MODEL,
  maxResults = DEFAULT_MAX_RESULTS,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  searchContextSize = DEFAULT_SEARCH_CONTEXT_SIZE,
  reasoningEffort = DEFAULT_REASONING_EFFORT,
  pricing,
  fetcher = fetch,
  logger = createDevelopmentLogger(),
  now = Date.now,
  searchProfile = "general",
  resultUrlPolicy,
}: OpenAIWebSearchOptions = {}): SupplierSearchSource {
  const configured = Boolean(apiKey?.trim());
  const safeMaxResults = clampInteger(maxResults, DEFAULT_MAX_RESULTS, 1, MAX_RESULTS);
  const safeRequestTimeoutMs = clampInteger(
    requestTimeoutMs,
    DEFAULT_REQUEST_TIMEOUT_MS,
    MIN_REQUEST_TIMEOUT_MS,
    MAX_REQUEST_TIMEOUT_MS,
  );

  return {
    name: "openai-web-search-v1",
    implemented: configured,
    trustedRelevance: true,

    async healthCheck() {
      return configured;
    },

    async search(input, signal): Promise<SupplierSearchOutcome> {
      if (!apiKey?.trim()) {
        return { results: [], reason: "OpenAI web search is not configured." };
      }

      const startedAt = now();
      const request = createRequestSignal(signal, safeRequestTimeoutMs);
      let response: Response;
      try {
        response = await fetcher("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
          },
          signal: request.signal,
          body: JSON.stringify({
            model,
            store: false,
            reasoning: { effort: reasoningEffort },
            tool_choice: "required",
            tools: [{
              type: "web_search",
              search_context_size: searchContextSize,
            }],
            include: ["web_search_call.action.sources"],
            input: [
              {
                role: "developer",
                content: [{
                  type: "input_text",
                  text: developerInstruction(searchProfile),
                }],
              },
              {
                role: "user",
                content: [{
                  type: "input_text",
                  text: buildPrompt(input, safeMaxResults, searchProfile),
                }],
              },
            ],
            text: {
              format: {
                type: "json_schema",
                name: "supplier_offer_search_results",
                description: "Verified live supplier product pages and only fields confirmed by those pages.",
                strict: true,
                schema: supplierResultsJsonSchema,
              },
            },
          }),
        });
      } catch (error) {
        if (request.timedOut() && !signal.aborted) {
          throw new Error(
            `OpenAI web search timed out after ${Math.ceil(safeRequestTimeoutMs / 1_000)} seconds.`,
          );
        }
        throw error;
      } finally {
        request.cleanup();
      }

      const payload = await response.json().catch(() => null) as OpenAIResponse | null;
      if (!response.ok || !payload) {
        const message = payload?.error?.message ?? `OpenAI Responses API returned HTTP ${response.status}.`;
        throw new Error(message);
      }
      if (payload.status && payload.status !== "completed") {
        throw new Error(`OpenAI Responses API status: ${payload.status}.`);
      }

      const durationMs = Math.max(0, now() - startedAt);
      const aiUsage = buildUsageReport(payload, model, durationMs, pricing);
      const outputText = extractOutputText(payload);
      if (!outputText) {
        return {
          results: [],
          reason: "OpenAI Responses API returned no structured output.",
          ...(aiUsage.length > 0 ? { aiUsage } : {}),
        };
      }

      let parsed: SupplierSearchResult[];
      try {
        const decoded = JSON.parse(outputText) as { results?: unknown };
        parsed = supplierSearchResultsSchema.parse(decoded.results ?? []);
      } catch (error) {
        logger("openai_web_search_invalid_output", {
          model,
          search_profile: searchProfile,
          response_id: payload.id ?? null,
          error_name: error instanceof Error ? error.name : "UnknownError",
        });
        return {
          results: [],
          reason: "TAJA web search returned invalid structured output.",
          ...(aiUsage.length > 0 ? { aiUsage } : {}),
        };
      }

      const citedUrls = collectCitedUrls(payload);
      const filtered = keepOnlyCitedResults(
        parsed,
        citedUrls,
        safeMaxResults,
        resultUrlPolicy,
      );
      const queryVariantCount = normalizedQueryVariants(input).length;

      logger("openai_web_search", {
        model,
        search_profile: searchProfile,
        reasoning_effort: reasoningEffort,
        search_context_size: searchContextSize,
        request_timeout_ms: safeRequestTimeoutMs,
        query_variants: queryVariantCount,
        response_id: payload.id ?? null,
        cited_sources: citedUrls.length,
        parsed_results: parsed.length,
        accepted_results: filtered.accepted.length,
        rejected_results: filtered.rejected.length,
        rejected_result_samples: filtered.rejected.slice(0, 10),
        input_tokens: payload.usage?.input_tokens ?? null,
        cached_input_tokens: payload.usage?.input_tokens_details?.cached_tokens ?? null,
        output_tokens: payload.usage?.output_tokens ?? null,
        reasoning_output_tokens: payload.usage?.output_tokens_details?.reasoning_tokens ?? null,
        total_tokens: payload.usage?.total_tokens ?? null,
        web_search_calls: countWebSearchCalls(payload),
        estimated_cost_usd: aiUsage[0]?.estimatedTotalCostUsd ?? null,
      });

      return filtered.accepted.length > 0
        ? {
            results: filtered.accepted,
            ...(aiUsage.length > 0 ? { aiUsage } : {}),
          }
        : {
            results: [],
            reason: citedUrls.length === 0
              ? "TAJA web search returned no cited sources."
              : searchProfile === "1688_only"
                ? "TAJA 1688 search returned no cited direct 1688 offer pages."
                : "TAJA web search returned no cited direct supplier product pages.",
            ...(aiUsage.length > 0 ? { aiUsage } : {}),
          };
    },
  };
}
