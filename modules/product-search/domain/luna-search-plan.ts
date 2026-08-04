import type {
  ProjectSupplierSearchRequest,
  SupplierOfferSearchInput,
  SupplierOfferSearchResult,
} from "./search";

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

export type LunaSearchPlan = {
  mode: "DETERMINISTIC_MVP";
  category: string | null;
  originalQuery: string;
  englishQuery: string;
  providerQuery: string;
  chinese1688Query: string | null;
  constraints: {
    quantity: number;
    targetCountry: string;
    maxUnitPrice: number | null;
    maxUnitPriceCurrency: string | null;
    maxMoq: number | null;
    targetMarginPercent: number | null;
    avoidComplexCompliance: boolean;
    privateLabel: boolean;
  };
  warnings: string[];
};

export function createLunaSearchPlan(input: ProjectSupplierSearchRequest): LunaSearchPlan {
  const catalogEntry = findCatalogEntry(input.query);
  const englishQuery = catalogEntry?.englishQuery ?? input.query.trim();
  const chineseBaseQuery = catalogEntry?.chineseQuery ?? null;
  const providerQuery = [
    englishQuery,
    input.privateLabel ? "OEM private label" : null,
  ].filter(Boolean).join(" ");
  const chinese1688Query = chineseBaseQuery
    ? [
        chineseBaseQuery,
        "厂家 批发",
        input.privateLabel ? "OEM 贴牌" : null,
      ].filter(Boolean).join(" ")
    : null;
  const warnings: string[] = [];

  if (!chinese1688Query) {
    warnings.push("Kineski upit još nije potvrđen. Koristite originalni upit ili ručno unesite kineski izraz.");
  }
  if (input.avoidComplexCompliance) {
    warnings.push("Sertifikacioni rizik je zabeležen kao uslov, ali u ovom MVP rezu još nije automatski verifikovan.");
  }
  if (input.maxUnitPrice !== undefined) {
    warnings.push("Maksimalna cena se automatski filtrira samo kada je valuta rezultata ista kao zadata valuta.");
  }
  if (input.targetMarginPercent !== undefined) {
    warnings.push("Ciljna marža se potvrđuje tek nakon obračuna ukupne nabavne cene.");
  }

  return {
    mode: "DETERMINISTIC_MVP",
    category: catalogEntry?.category ?? null,
    originalQuery: input.query.trim(),
    englishQuery,
    providerQuery,
    chinese1688Query,
    constraints: {
      quantity: input.quantity,
      targetCountry: input.targetCountry,
      maxUnitPrice: input.maxUnitPrice ?? null,
      maxUnitPriceCurrency: input.maxUnitPriceCurrency ?? null,
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
      request.maxUnitPriceCurrency !== undefined &&
      result.price !== null &&
      result.currency === request.maxUnitPriceCurrency &&
      result.price > request.maxUnitPrice
    ) {
      return false;
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
