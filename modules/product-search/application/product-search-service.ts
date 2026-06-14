import { OfferExtractionStatus, ProjectActivityType, SupplierOfferSource } from "@prisma/client";
import { prisma } from "../../../lib/database/prisma";
import {
  supplierOfferSearchInputSchema,
  supplierOfferSearchResultsSchema,
  type SupplierOfferSearchProvider,
  type SupplierOfferSearchResult,
  type SupplierOfferUrlImportProvider,
} from "../domain/search";
import { getSupplierOfferSearchProvider } from "../infrastructure/provider";
import { getSupplierOfferUrlImportProvider } from "../infrastructure/url-import-provider";
import { recordProjectActivity } from "../../timeline/application/timeline-service";
import { searchSupplierOffersWithPersistentFallback } from "./search-fallback";

export class ProductSearchProjectNotFoundError extends Error {}

export async function searchProjectSupplierOffers(
  projectId: string,
  organizationId: string,
  searchInput: unknown,
  provider: SupplierOfferSearchProvider = getSupplierOfferSearchProvider(),
) {
  const project = await prisma.importProject.findFirst({
    where: { id: projectId, organizationId },
    select: { id: true },
  });
  if (!project) throw new ProductSearchProjectNotFoundError();

  const input = supplierOfferSearchInputSchema.parse(searchInput);
  return searchSupplierOffersWithPersistentFallback(input, provider);
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
        sourceMetadata: {
          title: result.title,
          productUrl: result.productUrl,
          imageUrl: result.imageUrl,
          providerSource: result.source,
        },
      },
    });
    await recordProjectActivity(transaction, {
      organizationId,
      projectId,
      type: ProjectActivityType.OFFER_ADDED,
      title: "Ponuda iz pretrage je dodata",
      description: offer.supplierName,
      metadata: { offerId: offer.id, supplierName: offer.supplierName, source: result.source },
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
  return provider.previewSupplierOfferUrl(productUrl);
}
