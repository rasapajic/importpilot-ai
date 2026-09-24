import { calculateLandedCost } from "../modules/cost-engine/domain/calculator";
import type { SupplierOfferSearchResult } from "../modules/product-search/domain/search";
import { generateRfqMessage } from "../modules/product-search/domain/rfq";

export const JAKOV360_ACCEPTANCE_PROJECT_ID = "36000000-0000-4000-8000-000000000001";
export const JAKOV360_ACCEPTANCE_PROJECT_NAME = "JAKOV360 Acceptance pregled";
export const JAKOV360_DEMO_EMAIL = "owner@tradepilot.local";
export const JAKOV360_DEMO_ORGANIZATION_ID = "00000000-0000-4000-8000-000000000001";

export type AcceptanceSeedEnvironment = {
  nodeEnv?: string;
  databaseUrl?: string;
  explicitConfirmation?: string;
};

export type AcceptanceOfferFixture = {
  id: string;
  supplierName: string;
  supplierCountry: string | null;
  moq: number | null;
  unitPrice: string | null;
  currency: string | null;
  incoterm: string | null;
  sourceMetadata: Record<string, unknown>;
};

export type AcceptanceSearchCacheFixture = {
  id: string;
  query: string;
  quantity: number;
  targetCountry: string;
  results: SupplierOfferSearchResult[];
};

const localDatabaseHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function assertJakov360AcceptanceSeedAllowed(environment: AcceptanceSeedEnvironment) {
  if (environment.explicitConfirmation !== "1") {
    throw new Error("Set JAKOV360_ACCEPTANCE_SEED=1 to confirm the local acceptance seed.");
  }
  if (environment.nodeEnv !== "development" && environment.nodeEnv !== "test") {
    throw new Error("JAKOV360 acceptance seed requires NODE_ENV=development or test.");
  }
  if (!environment.databaseUrl) {
    throw new Error("DATABASE_URL is required for the JAKOV360 acceptance seed.");
  }

  let databaseUrl: URL;
  try {
    databaseUrl = new URL(environment.databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL.");
  }

  if (!new Set(["postgres:", "postgresql:"]).has(databaseUrl.protocol)) {
    throw new Error("JAKOV360 acceptance seed supports PostgreSQL only.");
  }
  if (!localDatabaseHosts.has(databaseUrl.hostname)) {
    throw new Error(`Refusing non-local database host: ${databaseUrl.hostname}`);
  }

  const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\//, ""));
  if (!databaseName) throw new Error("DATABASE_URL must include a database name.");
  if (/(^|[-_])(prod|production|live)([-_]|$)/i.test(databaseName)) {
    throw new Error(`Refusing production-like database name: ${databaseName}`);
  }

  return { databaseHost: databaseUrl.hostname, databaseName };
}

export function buildJakov360AcceptanceSeedPlan() {
  const quantityTiers = [
    { minQuantity: 12, maxQuantity: 499, price: 1.14, currency: "EUR", confirmed: true },
    { minQuantity: 500, maxQuantity: 1199, price: 0.964, currency: "EUR", confirmed: true },
    { minQuantity: 1200, maxQuantity: 4999, price: 0.86, currency: "EUR", confirmed: true },
    { minQuantity: 5000, maxQuantity: null, price: null, currency: null, confirmed: false },
  ] satisfies NonNullable<SupplierOfferSearchResult["quantityTiers"]>;

  const glasses: SupplierOfferSearchResult = {
    title: "Zaštitne naočare — JAKOV360 acceptance primer",
    supplierName: "Shenzhen Vision Safety",
    supplierCountry: "CN",
    price: 0.964,
    currency: "EUR",
    minimumOrderQuantity: 500,
    incoterm: "FOB",
    productUrl: "https://supplier.example/jakov360/safety-glasses",
    imageUrl: "http://localhost:3000/jakov360-acceptance-glasses.svg",
    source: "Made-in-China acceptance fixture",
    offerType: "DIRECT_IMPORT",
    sellerCountry: "CN",
    originCountry: "CN",
    availabilityConfirmed: true,
    b2bPriceConfirmed: true,
    quantityTiers,
  };

  const dudi: SupplierOfferSearchResult = {
    title: "Dudi Co. USB-C punjač — retail primer za 100 kom",
    supplierName: "Dudi Co.",
    supplierCountry: "RS",
    price: 1099,
    currency: "RSD",
    minimumOrderQuantity: 100,
    incoterm: null,
    productUrl: "https://domestic-supplier.example/jakov360/usb-c-charger",
    imageUrl: null,
    source: "Dudi Co.",
    offerType: "DOMESTIC",
    sellerCountry: "RS",
    originCountry: "CN",
    importerName: "Dudi Co.",
    priceIncludesVat: true,
    netPrice: 916,
    availabilityConfirmed: false,
    b2bPriceConfirmed: false,
  };

  const directImport: SupplierOfferSearchResult = {
    title: "USB-C PD 20W punjač — direktan uvoz",
    supplierName: "Dongguan Power Export",
    supplierCountry: "CN",
    price: 1.38,
    currency: "EUR",
    minimumOrderQuantity: 100,
    incoterm: "FOB",
    productUrl: "https://supplier.example/jakov360/usb-c-pd-charger",
    imageUrl: "http://localhost:3000/jakov360-acceptance-glasses.svg",
    source: "Alibaba acceptance fixture",
    offerType: "DIRECT_IMPORT",
    sellerCountry: "CN",
    originCountry: "CN",
    availabilityConfirmed: true,
    b2bPriceConfirmed: true,
  };

  const unknown: SupplierOfferSearchResult = {
    title: "USB-C punjač — nepotpun izvor",
    supplierName: "Nepotvrđen prodavac",
    supplierCountry: null,
    price: null,
    currency: null,
    minimumOrderQuantity: null,
    incoterm: null,
    productUrl: "https://supplier.example/jakov360/unconfirmed-charger",
    imageUrl: null,
    source: "Acceptance fixture",
    offerType: "UNKNOWN",
    availabilityConfirmed: false,
    b2bPriceConfirmed: false,
  };

  const customsProvenance = {
    sourceName: "Uprava carina Republike Srbije — TARIS",
    officialUrl: "https://www.carina.rs/sr/privreda/tarifski-poslovi/taris.html",
    checkedAt: null,
    validFrom: null,
    tariffCode: "9004",
    originCountry: "CN",
    shippingCountry: "CN",
    rateType: "unknown",
    confirmedByOfficialSource: false,
    classificationSuggested: true,
  } as const;

  const rfqExamples = {
    sample: generateRfqMessage({
      productTitle: glasses.title,
      supplierName: glasses.supplierName,
      quantity: 1000,
      deliveryCountry: "RS",
      orderType: "SAMPLE",
      incoterm: glasses.incoterm,
      productUrl: glasses.productUrl,
    }),
    fullOrder: generateRfqMessage({
      productTitle: glasses.title,
      supplierName: glasses.supplierName,
      quantity: 1000,
      deliveryCountry: "RS",
      orderType: "FULL_ORDER",
      incoterm: glasses.incoterm,
      productUrl: glasses.productUrl,
    }),
  };

  const offers: AcceptanceOfferFixture[] = [
    {
      id: "36000000-0000-4000-8000-000000000010",
      supplierName: glasses.supplierName,
      supplierCountry: glasses.supplierCountry,
      moq: glasses.minimumOrderQuantity,
      unitPrice: glasses.price?.toString() ?? null,
      currency: glasses.currency,
      incoterm: glasses.incoterm,
      sourceMetadata: {
        title: glasses.title,
        productUrl: glasses.productUrl,
        imageUrl: glasses.imageUrl,
        providerSource: glasses.source,
        offerType: glasses.offerType,
        sellerCountry: glasses.sellerCountry,
        originCountry: glasses.originCountry,
        availabilityConfirmed: glasses.availabilityConfirmed,
        b2bPriceConfirmed: glasses.b2bPriceConfirmed,
        quantityTiers,
        requestedQuantity: 1000,
        transportEstimated: true,
        customsProvenance,
        acceptanceRfqExamples: rfqExamples,
      },
    },
    {
      id: "36000000-0000-4000-8000-000000000020",
      supplierName: dudi.supplierName,
      supplierCountry: dudi.supplierCountry,
      moq: dudi.minimumOrderQuantity,
      unitPrice: dudi.price?.toString() ?? null,
      currency: dudi.currency,
      incoterm: dudi.incoterm,
      sourceMetadata: {
        title: dudi.title,
        productUrl: dudi.productUrl,
        imageUrl: dudi.imageUrl,
        providerSource: dudi.source,
        offerType: dudi.offerType,
        sellerCountry: dudi.sellerCountry,
        originCountry: dudi.originCountry,
        importerName: dudi.importerName,
        priceIncludesVat: dudi.priceIncludesVat,
        netPrice: dudi.netPrice,
        availabilityConfirmed: dudi.availabilityConfirmed,
        b2bPriceConfirmed: dudi.b2bPriceConfirmed,
        requestedQuantity: 100,
        retailPriceOnly: true,
      },
    },
    {
      id: "36000000-0000-4000-8000-000000000030",
      supplierName: directImport.supplierName,
      supplierCountry: directImport.supplierCountry,
      moq: directImport.minimumOrderQuantity,
      unitPrice: directImport.price?.toString() ?? null,
      currency: directImport.currency,
      incoterm: directImport.incoterm,
      sourceMetadata: {
        title: directImport.title,
        productUrl: directImport.productUrl,
        imageUrl: directImport.imageUrl,
        providerSource: directImport.source,
        offerType: directImport.offerType,
        sellerCountry: directImport.sellerCountry,
        originCountry: directImport.originCountry,
        availabilityConfirmed: directImport.availabilityConfirmed,
        b2bPriceConfirmed: directImport.b2bPriceConfirmed,
      },
    },
    {
      id: "36000000-0000-4000-8000-000000000040",
      supplierName: unknown.supplierName,
      supplierCountry: unknown.supplierCountry,
      moq: unknown.minimumOrderQuantity,
      unitPrice: null,
      currency: null,
      incoterm: null,
      sourceMetadata: {
        title: unknown.title,
        productUrl: unknown.productUrl,
        imageUrl: null,
        providerSource: unknown.source,
        offerType: unknown.offerType,
        availabilityConfirmed: unknown.availabilityConfirmed,
        b2bPriceConfirmed: unknown.b2bPriceConfirmed,
      },
    },
  ];

  const glassesCalculation = calculateLandedCost({
    targetCountry: "RS",
    quantity: 1000,
    unitPrice: "0.964",
    currency: "EUR",
    incoterm: "FOB",
    shippingCost: "0",
    customsDutyRate: "0",
    vatRate: "20",
    storageCost: "0",
    inspectionCost: "0",
    otherCosts: "0",
    targetSellingPrice: "4",
  });

  const searchCaches: AcceptanceSearchCacheFixture[] = [
    {
      id: "36000000-0000-4000-8000-000000000100",
      query: JAKOV360_ACCEPTANCE_PROJECT_NAME,
      quantity: 1000,
      targetCountry: "RS",
      results: [glasses, dudi, directImport, unknown],
    },
    {
      id: "36000000-0000-4000-8000-000000000110",
      query: "Dudi Co. punjač",
      quantity: 100,
      targetCountry: "RS",
      results: [dudi],
    },
  ];

  return {
    project: {
      id: JAKOV360_ACCEPTANCE_PROJECT_ID,
      name: JAKOV360_ACCEPTANCE_PROJECT_NAME,
      targetCountry: "RS",
      quantity: 1000,
      targetMargin: 30,
    },
    offers,
    glassesOfferId: offers[0].id,
    glassesCalculation: {
      id: "36000000-0000-4000-8000-000000000200",
      ...glassesCalculation,
    },
    searchCaches,
    rfqExamples,
  };
}
