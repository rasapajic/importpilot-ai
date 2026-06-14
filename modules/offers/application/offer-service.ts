import { OfferExtractionStatus, ProjectActivityType } from "@prisma/client";
import type { z } from "zod";

import { prisma } from "@/lib/database/prisma";
import {
  deletableManualOfferFilter,
  tenantOfferFilter,
} from "@/modules/offers/domain/offer-access";
import type { manualOfferSchema } from "@/modules/offers/domain/offer-validation";
import { findOrganizationProject } from "@/modules/projects/application/project-service";
import { recordProjectActivity } from "@/modules/timeline/application/timeline-service";

type ManualOfferInput = z.infer<typeof manualOfferSchema>;

export class OfferProjectNotFoundError extends Error {}
export class OfferNotFoundError extends Error {}

export async function createManualOffer(
  projectId: string,
  organizationId: string,
  input: ManualOfferInput,
) {
  if (!(await findOrganizationProject(projectId, organizationId))) {
    throw new OfferProjectNotFoundError();
  }

  return prisma.$transaction(async (transaction) => {
    const offer = await transaction.supplierOffer.create({
      data: {
        ...input,
        projectId,
        organizationId,
        extractionStatus: OfferExtractionStatus.MANUAL,
      },
    });
    await recordProjectActivity(transaction, {
      organizationId,
      projectId,
      type: ProjectActivityType.OFFER_ADDED,
      title: "Ponuda je dodata",
      description: offer.supplierName,
      metadata: { offerId: offer.id, supplierName: offer.supplierName },
    });
    return offer;
  });
}

export async function updateManualOffer(
  offerId: string,
  organizationId: string,
  input: ManualOfferInput,
) {
  const offer = await prisma.supplierOffer.findFirst({
    where: tenantOfferFilter(offerId, organizationId),
  });
  if (!offer) throw new OfferNotFoundError();

  return prisma.supplierOffer.update({
    where: { id: offerId },
    data: {
      ...input,
      extractionStatus:
        offer.extractionStatus === OfferExtractionStatus.EXTRACTED
          ? OfferExtractionStatus.REVIEWED
          : offer.extractionStatus,
    },
  });
}

export async function deleteManualOffer(offerId: string, organizationId: string) {
  const result = await prisma.supplierOffer.deleteMany({
    where: deletableManualOfferFilter(offerId, organizationId),
  });
  if (result.count !== 1) throw new OfferNotFoundError();
}
