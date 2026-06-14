import { OfferExtractionStatus, type Prisma } from "@prisma/client";

export function tenantOfferFilter(
  offerId: string,
  organizationId: string,
): Prisma.SupplierOfferWhereInput {
  return { id: offerId, organizationId };
}

export function deletableManualOfferFilter(
  offerId: string,
  organizationId: string,
): Prisma.SupplierOfferWhereInput {
  return {
    ...tenantOfferFilter(offerId, organizationId),
    extractionStatus: OfferExtractionStatus.MANUAL,
  };
}

