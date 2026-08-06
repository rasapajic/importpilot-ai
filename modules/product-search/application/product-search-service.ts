import { OfferExtractionStatus, ProjectActivityType, SupplierOfferSource } from "@prisma/client";
import { prisma } from "../../../lib/database/prisma";
import { recordAiUsageEvents } from "../../ai-usage/application/ai-usage-service";
import {
  projectSupplierSearchRequestSchema,
  supplierOfferSearchInputSchema,
  supplierOfferSearchResultsSchema,
  type SupplierOfferSearchProvider,
  type SupplierOfferSearchResult,
  type SupplierOfferUrlImportProvider,
} from "../domain/search";
import {
  applyLunaSearchConstraints,
  buildLunaProviderSearchInput,
  createLunaSearchPlan,
} from "../domain/luna-search-plan";
import { analyzeAndRankTajaCandidates } from "../domain/taja-candidate-analysis";
import {
  createBrowserAssisted1688Preview,
  createSupplierOfferSourceMetadata,
} from "../domain/source-provenance";
import { getSupplierOfferSearchProvider } from "../infrastructure/provider";
import { getSupplierOfferUrlImportProvider } from "../infrastructure/url-import-provider";
import { recordProjectActivity } from "../../timeline/application/timeline-service";
import { searchSupplierOffersWithPersistentFallback } from "./search-fallback";

export class ProductSearchProjectNotFoundError extends Error {}

export class DuplicateSupplierOfferUrlError extends Error {
  constructor(readonly existingOfferId: string) {
    super("Ponuda sa istim izvornim linkom je već dodata u projekat.");
  }
}

export async function searchProjectSupplierOffers(
  projectId: string,
  organizationId: string,
  searchInput: unknown,
  provider?: SupplierOfferSearchProvider,
) {
  const project = await prisma.importProject.findFirst({
    where: { id: projectId, organizationId },
    select: { id: true, targetMargin: true },
  });
  if (!project) throw new ProductSearchProjectNotFoundError();

  const activeProvider = provider ?? getSupplierOfferSearchProvider({
    onAiUsage: async (events) => {
      await recordAiUsageEvents({ organizationId, projectId: project.id, events });
    },
  });
  const request = projectSupplierSearchRequestSchema.parse(searchInput);
  const effectiveRequest = {
    ...request,
    targetMarginPercent: request.targetMarginPercent ?? Number(project.targetMargin.toString()),
  };
  const lunaPlan = createLunaSearchPlan(effectiveRequest);
  const providerInput = supplierOfferSearchInputSchema.parse(
    buildLunaProviderSearchInput(lunaPlan, effectiveRequest),
  );
  const outcome = await searchSupplierOffersWithPersistentFallback(providerInput, activeProvider);
  const fetchedAt = new Date().toISOString();
  const constrainedResults = applyLunaSearchConstraints(outcome.results, effectiveRequest);
  const tajaAnalysis = analyzeAndRankTajaCandidates(
    constrainedResults.map((result) => ({ result })),
    {
      quantity: effectiveRequest.quantity,
      targetMarginPercent: effectiveRequest.targetMarginPercent,
    },
  );
  const results = tajaAnalysis.rankedResults.map((result) => ({
    ...result,
    provenance: {
      fetchedAt,
      resultOrigin: outcome.resultOrigin ?? "live",
      originalQuery: effectiveRequest.query,
      providerQuery: lunaPlan.providerQuery,
      chinese1688Query: lunaPlan.chinese1688Query,
      targetCountry: effectiveRequest.targetCountry,
      quantity: effectiveRequest.quantity,
    },
  }));

  return {
    ...outcome,
    results,
    candidateAnalyses: tajaAnalysis.analyses,
    unfilteredResultCount: outcome.results.length,
    lunaPlan,
    fetchedAt,
  };
}

export async function importSearchResult(
  projectId: string,
  organizationId: string,
  input: SupplierOfferSearchResult,
) {
  const result = supplierOfferSearchResultsSchema.element.parse(input);
  const project = await prisma.importProject.findFirst({
    where: { id: projectId, organizationId },
    select: { id: true },
  });
  if (!project) throw new ProductSearchProjectNotFoundError();

  const existingOffer = await prisma.supplierOffer.findFirst({
    where: {
      organizationId,
      projectId,
      source: SupplierOfferSource.SEARCH_RESULT,
      sourceMetadata: {
        path: ["productUrl"],
        equals: result.productUrl,
      },
    },
    select: { id: true },
  });
  if (existingOffer) throw new DuplicateSupplierOfferUrlError(existingOffer.id);

  const sourceMetadata = createSupplierOfferSourceMetadata(result);

  return prisma.$transaction(async (transaction) => {
    const offer = await transaction.supplierOffer.create({
      data: {
        organizationId,
        projectId,
        supplierName: result.supplierName,
        supplierCountry: result.supplierCountry,
        moq: result.minimumOrderQuantity,
        unitPrice: result.price,
        currency: result.currency,
        incoterm: result.incoterm,
        extractionStatus: OfferExtractionStatus.MANUAL,
        source: SupplierOfferSource.SEARCH_RESULT,
        sourceMetadata,
      },
    });
    await recordProjectActivity(transaction, {
      organizationId,
      projectId: offer.projectId,
      type: ProjectActivityType.OFFER_ADDED,
      title: "Ponuda iz pretrage je dodata",
      description: offer.supplierName,
      metadata: {
        offerId: offer.id,
        supplierName: offer.supplierName,
        source: result.source,
        sourceHost: sourceMetadata.sourceHost,
        fetchedAt: sourceMetadata.fetchedAt,
        resultOrigin: sourceMetadata.resultOrigin,
      },
    });
    return offer;
  });
}

export async function previewProjectSupplierOfferUrl(
  projectId: string,
  organizationId: string,
  productUrl: string,
  provider: SupplierOfferUrlImportProvider = getSupplierOfferUrlImportProvider(),
) {
  const project = await prisma.importProject.findFirst({
    where: { id: projectId, organizationId },
    select: { id: true },
  });
  if (!project) throw new ProductSearchProjectNotFoundError();

  const browserAssisted1688Preview = createBrowserAssisted1688Preview(productUrl);
  if (browserAssisted1688Preview) return browserAssisted1688Preview;

  return provider.previewSupplierOfferUrl(productUrl);
}
