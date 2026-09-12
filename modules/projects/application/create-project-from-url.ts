import {
  OfferExtractionStatus,
  ProjectActivityType,
  ProjectCompletionStatus,
  SupplierOfferSource,
} from "@prisma/client";

import { prisma } from "@/lib/database/prisma";
import { createSupplierOfferSourceMetadata } from "@/modules/product-search/domain/source-provenance";
import { recordProjectActivity } from "@/modules/timeline/application/timeline-service";
import type { CreateProjectFromUrlRequest } from "../domain/url-project-creation";

/**
 * Creates the project, its completion history, the initial URL offer and both
 * timeline events in one database transaction. Either the entire URL-first
 * workflow is saved or nothing is saved; a failed offer import can no longer
 * leave an empty project behind.
 */
export function createProjectFromUrl(
  input: CreateProjectFromUrlRequest,
  organizationId: string,
  userId: string,
) {
  const sourceMetadata = createSupplierOfferSourceMetadata(input.offer);

  return prisma.$transaction(async (transaction) => {
    const project = await transaction.importProject.create({
      data: {
        ...input.project,
        organizationId,
        createdById: userId,
      },
    });

    await transaction.projectCompletionHistory.create({
      data: {
        organizationId,
        projectId: project.id,
        status: ProjectCompletionStatus.ACTIVE,
      },
    });

    await recordProjectActivity(transaction, {
      organizationId,
      projectId: project.id,
      type: ProjectActivityType.PROJECT_CREATED,
      title: "Projekat je kreiran",
      metadata: { projectName: project.name },
    });

    const offer = await transaction.supplierOffer.create({
      data: {
        organizationId,
        projectId: project.id,
        supplierName: input.offer.supplierName,
        supplierCountry: input.offer.supplierCountry,
        moq: input.offer.minimumOrderQuantity,
        unitPrice: input.offer.price,
        currency: input.offer.currency,
        incoterm: input.offer.incoterm,
        extractionStatus: OfferExtractionStatus.MANUAL,
        source: SupplierOfferSource.SEARCH_RESULT,
        sourceMetadata,
      },
    });

    await recordProjectActivity(transaction, {
      organizationId,
      projectId: project.id,
      type: ProjectActivityType.OFFER_ADDED,
      title: "Ponuda iz linka je dodata",
      description: offer.supplierName,
      metadata: {
        offerId: offer.id,
        supplierName: offer.supplierName,
        source: input.offer.source,
        sourceHost: sourceMetadata.sourceHost,
        fetchedAt: sourceMetadata.fetchedAt,
        resultOrigin: sourceMetadata.resultOrigin,
      },
    });

    return {
      projectId: project.id,
      offerId: offer.id,
    };
  });
}
