import {
  supplierSearchResultsSchema,
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

const DEFAULT_MODEL = "gpt-5";
const DEFAULT_MAX_RESULTS = 10;

type Fetcher = typeof fetch;

type OpenAIWebSearchOptions = {
  apiKey?: string;
  model?: string;
  maxResults?: number;
  fetcher?: Fetcher;
  logger?: DevelopmentLogger;
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
  };
  error?: {
    message?: string;
  } | null;
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
      maxItems: DEFAULT_MAX_RESULTS,
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
) {
  const citationKeys = new Set(
    citedUrls.map(comparableUrl).filter((value): value is string => Boolean(value)),
  );
  const seen = new Set<string>();
  const accepted: SupplierSearchResult[] = [];

  for (const result of results) {
    const key = comparableUrl(result.productUrl);
    if (!key || !citationKeys.has(key) || seen.has(key) || !isDirectPage(result.productUrl)) {
      continue;
    }
    seen.add(key);
    accepted.push(normalizeResult(result));
    if (accepted.length >= maxResults) break;
  }

  return accepted;
}

function buildPrompt(input: SearchRequest, maxResults: number) {
  return [
    "You are TAJA, a rigorous international sourcing analyst.",
    "Use live web search. Do not answer from memory.",
    `Find up to ${maxResults} current, directly openable supplier product pages for this product: ${input.productQuery}`,
    `Requested quantity: ${input.quantity}. Import destination: ${input.targetCountry}.`,
    "Prioritize manufacturers and B2B suppliers in China and India, including Alibaba, Made-in-China, Global Sources, 1688, IndiaMART, TradeIndia and direct manufacturer websites.",
    "Return only direct product-detail pages. Never return a homepage, category page, search-result page, blog post, marketplace editorial page or social-media page.",
    "Every productUrl must be a URL you actually opened or used as a web-search source during this response.",
    "Never invent a supplier, price, currency, MOQ, Incoterm, image URL or product URL.",
    "Use price and currency only when an explicit numeric unit price is visible on the cited page. If not confirmed, set both to null.",
    "Use MOQ only when explicitly stated as an integer. Otherwise set it to null.",
    "Use Incoterm only when explicitly stated. Otherwise set it to null.",
    "Use a two-letter supplier-country code only when confirmed; otherwise null.",
    "Keep the original product title and supplier name from the cited page.",
    "Return an empty results array when no verifiable direct product pages are found.",
  ].join("\n");
}

export function createOpenAIWebSearchSource({
  apiKey,
  model = DEFAULT_MODEL,
  maxResults = DEFAULT_MAX_RESULTS,
  fetcher = fetch,
  logger = createDevelopmentLogger(),
}: OpenAIWebSearchOptions = {}): SupplierSearchSource {
  const configured = Boolean(apiKey?.trim());
  const safeMaxResults = Math.max(1, Math.min(DEFAULT_MAX_RESULTS, Math.trunc(maxResults)));

  return {
    name: "openai-web-search-v1",
    implemented: configured,

    async healthCheck() {
      return configured;
    },

    async search(input, signal): Promise<SupplierSearchOutcome> {
      if (!apiKey?.trim()) {
        return { results: [], reason: "OpenAI web search is not configured." };
      }

      const response = await fetcher("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        signal,
        body: JSON.stringify({
          model,
          store: false,
          tool_choice: "required",
          tools: [{
            type: "web_search",
            search_context_size: "high",
          }],
          include: ["web_search_call.action.sources"],
          input: [
            {
              role: "developer",
              content: [{
                type: "input_text",
                text: "Use web search and produce only the requested structured supplier-offer data. Accuracy and source traceability are more important than returning many results.",
              }],
            },
            {
              role: "user",
              content: [{
                type: "input_text",
                text: buildPrompt(input, safeMaxResults),
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

      const payload = await response.json().catch(() => null) as OpenAIResponse | null;
      if (!response.ok || !payload) {
        const message = payload?.error?.message ?? `OpenAI Responses API returned HTTP ${response.status}.`;
        throw new Error(message);
      }
      if (payload.status && payload.status !== "completed") {
        throw new Error(`OpenAI Responses API status: ${payload.status}.`);
      }

      const outputText = extractOutputText(payload);
      if (!outputText) throw new Error("OpenAI Responses API returned no structured output.");

      const decoded = JSON.parse(outputText) as { results?: unknown };
      const parsed = supplierSearchResultsSchema.parse(decoded.results ?? []);
      const citedUrls = collectCitedUrls(payload);
      const accepted = keepOnlyCitedResults(parsed, citedUrls, safeMaxResults);

      logger("openai_web_search", {
        model,
        response_id: payload.id ?? null,
        cited_sources: citedUrls.length,
        parsed_results: parsed.length,
        accepted_results: accepted.length,
        input_tokens: payload.usage?.input_tokens ?? null,
        output_tokens: payload.usage?.output_tokens ?? null,
        total_tokens: payload.usage?.total_tokens ?? null,
      });

      return accepted.length > 0
        ? { results: accepted }
        : {
            results: [],
            reason: citedUrls.length === 0
              ? "TAJA web search returned no cited sources."
              : "TAJA web search returned no cited direct supplier product pages.",
          };
    },
  };
}
