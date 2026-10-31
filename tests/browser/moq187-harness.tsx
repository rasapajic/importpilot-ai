"use client";

import React from "react";
import { createRoot } from "react-dom/client";
import { I18nProvider } from "@/components/i18n/i18n-provider";
import { SimpleSupplierOfferSearch } from "@/components/search/simple-supplier-offer-search";
import type { SupplierOfferSearchResult } from "@/modules/product-search/domain/search";
import type { TajaCandidateAnalysisWithProductForm } from "@/modules/product-search/domain/taja-product-form-policy";

// Synthetic, isolated browser input. No real user, DB, staging, credentials,
// email, supplier messaging, or app API is consulted.
const dilicinUrl =
  "https://dilicn.en.made-in-china.com/product/jYzpeDtbEMkd/China-New-Model-Senior-Reading-Glasses-High-Definition-Wholesale-From-Manufacturers-Direct-Sales-.html";
const params = new URLSearchParams(window.location.search);
const savedMoq = params.get("savedMoq") === "200" ? 200 : 1200;

const offer = (
  productUrl: string,
  supplierName: string,
  price: number,
  moq: number,
): SupplierOfferSearchResult => ({
  productUrl,
  title: supplierName === "Dilicin" ? "New Model Senior Reading Glasses High Definition" : "Fixed diopter reading glasses",
  supplierName,
  supplierCountry: "CN",
  price,
  currency: "USD",
  advertisedPrice: price,
  advertisedCurrency: "USD",
  minimumOrderQuantity: moq,
  incoterm: null,
  imageUrl: null,
  source: "Made-in-China",
  marketplaceDetails: null,
});

const results: SupplierOfferSearchResult[] = [
  offer(dilicinUrl, "Dilicin", 0.18, savedMoq),
  offer("https://example.com/other-reading-glasses-1", "Wzouyuan", 0.35, 100),
  offer("https://example.com/other-reading-glasses-2", "Readsun", 1, 200),
];

// Only UI fields consumed by the actual Step 2 component are populated;
// every test remains PRELIMINARY, with deliberately low confidence.
const analyses = results.map((result, i) => ({
  productUrl: result.productUrl,
  rank: i + 1,
  status: "PRELIMINARY",
  overallScore: 55,
  confidenceScore: 24,
  finalEligible: false,
  supplierRiskLevel: "UNKNOWN",
  supplierRiskScore: 50,
  recommendationStatus: "NEEDS_NEGOTIATION",
  requirementMatch: { status: "UNCONFIRMED" },
  productForm: { matchStatus: "UNCLEAR", requestedCompleteSystem: false },
  missingData: [],
  explanation: "Synthetic acceptance fixture. No confirmed order terms.",
  preliminaryCostEstimate: null,
  landedCostStatus: "UNAVAILABLE",
})) as unknown as TajaCandidateAnalysisWithProductForm[];

const container = document.getElementById("root");
if (!container) throw Error("Missing isolated test root");
createRoot(container).render(
  <I18nProvider initialLocale="sr">
    <main style={{ width: "100%", maxWidth: "100%", margin: "0 auto", padding: "8px" }}>
      <SimpleSupplierOfferSearch
        projectId="isolated-moq187-fixture"
        productName="naočare za čitanje +1.00 do +3.50, fiksne dioptrije, nisu progresivne"
        quantity={1000}
        targetCountry="RS"
        initialOutcome={{
          results,
          candidateAnalyses: analyses,
          resultOrigin: "cache",
          fetchedAt: "2026-10-23T11:47:40.283Z",
          returnedFromCache: true,
        }}
      />
    </main>
  </I18nProvider>,
);
