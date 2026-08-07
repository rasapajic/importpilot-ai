import type {
  ProjectSupplierSearchRequest,
  SupplierOfferSearchInput,
  SupplierOfferSearchResult,
} from "./search";
import { extractTajaRequestedRequirements } from "./taja-requirement-match";

type LunaCatalogEntry = {
  category: string;
  keywords: string[];
  englishQuery: string;
  chineseQuery: string;
};

const LUNA_SEARCH_CATALOG: LunaCatalogEntry[] = [
  {
    category: "greenhouse-equipment",
    keywords: ["oprema za plastenike", "plastenik", "greenhouse"],
    englishQuery: "greenhouse equipment and accessories",
    chineseQuery: "温室大棚全套设备",
  },
  {
    category: "creative-household-gadgets",
    keywords: [
      "roba koja nikome ne treba",
      "neobicni proizvodi",
      "kreativni proizvodi",
      "impulsna kupovina",
      "gadzeti",
      "gedzeti",
      "viral products",
      "creative gadgets",
    ],
    englishQuery: "creative household gadgets viral products",
    chineseQuery: "新奇特产品 创意家居用品 网红爆款",
  },
  {
    category: "car-gadgets",
    keywords: ["auto gadzeti", "auto gedzeti", "automobilske sitnice", "car gadgets"],
    englishQuery: "creative car gadgets and accessories",
    chineseQuery: "汽车创意用品",
  },
  {
    category: "kitchen-gadgets",
    keywords: ["kuhinjski gadzeti", "kuhinjski gedzeti", "kuhinjske sitnice", "kitchen gadgets"],
    englishQuery: "creative kitchen gadgets",
    chineseQuery: "创意厨房用品",
  },
  {
    category: "home-organization",
    keywords: ["organizacija doma", "organizatori za kucu", "home organization"],
    englishQuery: "home organization products",
    chineseQuery: "家居收纳用品",
  },
  {
    category: "creative-gifts",
    keywords: ["kreativni pokloni", "neobicni pokloni", "creative gifts"],
    englishQuery: "creative gift products",
    chineseQuery: "创意礼品",
  },
  {
    category: "drip-irrigation",
    keywords: ["kap po kap", "navodnjavanje", "drip irrigation"],
    englishQuery: "drip irrigation kit",
    chineseQuery: "滴灌套装",
  },
  {
    category: "misting-system",
    keywords: ["vodena magla", "rashladjivanje terase", "misting system"],
    englishQuery: "patio misting cooling system",
    chineseQuery: "喷雾降温系统",
  },
];

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function findCatalogEntry(query: string) {
  const normalizedQuery = normalizeSearchText(query);
  return LUNA_SEARCH_CATALOG.find((entry) =>
    entry.keywords.some((keyword) => normalizedQuery.includes(normalizeSearchText(keyword))),
  ) ?? null;
}

function uniqueQueries(queries: Array<string | null | undefined>) {
  return [...new Set(
    queries
      .map((query) => query?.replace(/\s+/g, " ").trim())
      .filter((query): query is string => Boolean(query && query.length >= 2)),
  )].slice(0, 5);
}

function withEnglishCommercialTerms(query: string, privateLabel: boolean) {
  return [query, privateLabel ? "OEM private label" : null]
    .filter(Boolean)
    .join(" ");
}

function withChineseCommercialTerms(query: string, privateLabel: boolean) {
  return [query, "厂家 批发", privateLabel ? "OEM 贴牌" : null]
    .filter(Boolean)
    .join(" ");
}

function requirementDrivenMistingQueries(
  originalQuery: string,
  fallbackEnglishQuery: string,
  fallbackChineseQuery: string,
) {
  const requirements = extractTajaRequestedRequirements(originalQuery);
  const nozzleCountEnglish = requirements.nozzleCount !== null
    ? `${requirements.nozzleCount} nozzles`
    : requirements.nozzles
      ? "spray nozzles"
      : null;
  const nozzleCountChinese = requirements.nozzleCount !== null
    ? `${requirements.nozzleCount}个喷嘴`
    : requirements.nozzles
      ? "喷嘴"
      : null;
  const nozzleHeadChinese = requirements.nozzleCount !== null
    ? `${requirements.nozzleCount}喷头`
    : requirements.nozzles
      ? "喷头"
      : null;
  const pumpEnglish = requirements.pump ? "pump" : null;
  const pumpChinese = requirements.pump ? "水泵" : null;
  const locationEnglish = requirements.patio ? "patio" : "outdoor";
  const locationChinese = requirements.patio ? "露台" : "户外";

  return {
    english: uniqueQueries([
      [locationEnglish, "misting system", requirements.pump ? "with pump" : null, nozzleCountEnglish]
        .filter(Boolean)
        .join(" "),
      ["outdoor mist cooling kit", pumpEnglish, nozzleCountEnglish]
        .filter(Boolean)
        .join(" "),
      ["terrace misting system", nozzleCountEnglish, pumpEnglish, "kit"]
        .filter(Boolean)
        .join(" "),
      fallbackEnglishQuery,
    ]),
    chinese: uniqueQueries([
      [locationChinese, "喷雾降温系统", pumpChinese, nozzleCountChinese]
        .filter(Boolean)
        .join(" "),
      ["户外 喷雾套装", pumpChinese, nozzleHeadChinese]
        .filter(Boolean)
        .join(" "),
      ["庭院 喷雾降温", nozzleCountChinese, pumpChinese]
        .filter(Boolean)
        .join(" "),
      fallbackChineseQuery,
    ]),
  };
}

export type LunaSearchWarning =
  | "CHINESE_QUERY_UNCONFIRMED"
  | "COMPLIANCE_NOT_VERIFIED"
  | "PRICE_FILTER_SAME_CURRENCY_ONLY"
  | "MARGIN_AFTER_LANDED_COST";

export type LunaSearchPlan = {
  mode: "DETERMINISTIC_MVP";
  category: string | null;
  originalQuery: string;
  englishQuery: string;
  providerQuery: string;
  providerQueries: string[];
  chinese1688Query: string | null;
  chinese1688Queries: string[];
  constraints: {
    quantity: number;
    targetCountry: string;
    maxUnitPrice: number | null;
    maxUnitPriceCurrency: string | null;
    strictPriceLimit: boolean;
    maxMoq: number | null;
    targetMarginPercent: number | null;
    avoidComplexCompliance: boolean;
    privateLabel: boolean;
  };
  warnings: LunaSearchWarning[];
};

export function createLunaSearchPlan(input: ProjectSupplierSearchRequest): LunaSearchPlan {
  const catalogEntry = findCatalogEntry(input.query);
  const englishQuery = catalogEntry?.englishQuery ?? input.query.trim();
  const chineseBaseQuery = catalogEntry?.chineseQuery ?? null;
  const requirementQueries = catalogEntry?.category === "misting-system" && chineseBaseQuery
    ? requirementDrivenMistingQueries(input.query, englishQuery, chineseBaseQuery)
    : null;
  const providerQueries = uniqueQueries(
    (requirementQueries?.english ?? [englishQuery]).map((query) =>
      withEnglishCommercialTerms(query, input.privateLabel),
    ),
  );
  const chinese1688Queries = chineseBaseQuery
    ? uniqueQueries(
        (requirementQueries?.chinese ?? [chineseBaseQuery]).map((query) =>
          withChineseCommercialTerms(query, input.privateLabel),
        ),
      )
    : [];
  const providerQuery = providerQueries[0] ?? withEnglishCommercialTerms(
    englishQuery,
    input.privateLabel,
  );
  const chinese1688Query = chinese1688Queries[0] ?? null;
  const warnings: LunaSearchWarning[] = [];

  if (!chinese1688Query) warnings.push("CHINESE_QUERY_UNCONFIRMED");
  if (input.avoidComplexCompliance) warnings.push("COMPLIANCE_NOT_VERIFIED");
  if (input.maxUnitPrice !== undefined) warnings.push("PRICE_FILTER_SAME_CURRENCY_ONLY");
  if (input.targetMarginPercent !== undefined) warnings.push("MARGIN_AFTER_LANDED_COST");

  return {
    mode: "DETERMINISTIC_MVP",
    category: catalogEntry?.category ?? null,
    originalQuery: input.query.trim(),
    englishQuery,
    providerQuery,
    providerQueries,
    chinese1688Query,
    chinese1688Queries,
    constraints: {
      quantity: input.quantity,
      targetCountry: input.targetCountry,
      maxUnitPrice: input.maxUnitPrice ?? null,
      maxUnitPriceCurrency: input.maxUnitPriceCurrency ?? null,
      strictPriceLimit: input.strictPriceLimit ?? false,
      maxMoq: input.maxMoq ?? null,
      targetMarginPercent: input.targetMarginPercent ?? null,
      avoidComplexCompliance: input.avoidComplexCompliance ?? false,
      privateLabel: input.privateLabel ?? false,
    },
    warnings,
  };
}

export function buildLunaProviderSearchInput(
  plan: LunaSearchPlan,
  request: ProjectSupplierSearchRequest,
): SupplierOfferSearchInput {
  return {
    query: plan.providerQuery,
    queryVariants: plan.providerQueries,
    chinese1688QueryVariants: plan.chinese1688Queries,
    quantity: request.quantity,
    targetCountry: request.targetCountry,
  };
}

export function applyLunaSearchConstraints(
  results: SupplierOfferSearchResult[],
  request: ProjectSupplierSearchRequest,
) {
  return results.filter((result) => {
    if (
      request.maxMoq !== undefined &&
      result.minimumOrderQuantity !== null &&
      result.minimumOrderQuantity > request.maxMoq
    ) {
      return false;
    }

    if (
      request.maxUnitPrice !== undefined &&
      request.maxUnitPriceCurrency !== undefined
    ) {
      if (request.strictPriceLimit) {
        if (
          result.price === null ||
          result.currency !== request.maxUnitPriceCurrency ||
          result.price > request.maxUnitPrice
        ) {
          return false;
        }
      } else if (
        result.price !== null &&
        result.currency === request.maxUnitPriceCurrency &&
        result.price > request.maxUnitPrice
      ) {
        return false;
      }
    }

    return true;
  });
}

export function isPartialLunaSearchResult(result: SupplierOfferSearchResult) {
  return result.price === null ||
    result.currency === null ||
    result.minimumOrderQuantity === null ||
    result.supplierCountry === null ||
    result.incoterm === null;
}
