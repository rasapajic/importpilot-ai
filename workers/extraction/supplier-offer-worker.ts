import { FileProcessingStatus, OfferExtractionStatus } from "@prisma/client";

import { prisma } from "@/lib/database/prisma";
import { supplierOfferExtractionSchema } from "@/modules/offers/domain/extraction-schema";
import type {
  SaveExtractionInput,
  SupplierOfferExtractionWorker,
} from "@/workers/extraction/contracts";

export class ExtractionProviderNotConfiguredError extends Error {}

export class PreparedSupplierOfferWorker implements SupplierOfferExtractionWorker {
  async extractText(): Promise<string> {
    throw new ExtractionProviderNotConfiguredError("OCR provider nije konfigurisan.");
  }

  async extractSupplierOffer(): Promise<never> {
    throw new ExtractionProviderNotConfiguredError("AI provider nije konfigurisan.");
  }

  async saveExtractionResult(input: SaveExtractionInput) {
    const result = supplierOfferExtractionSchema.parse(input.result);

    await prisma.$transaction(async (transaction) => {
      const file = await transaction.uploadedFile.findFirst({
        where: {
          id: input.fileId,
          projectId: input.projectId,
          organizationId: input.organizationId,
        },
      });
      if (!file) throw new Error("Fajl nije pronađen u aktivnom tenant-u.");

      await transaction.supplierOffer.upsert({
        where: { fileId: input.fileId },
        update: {
          ...result,
          extractionStatus: OfferExtractionStatus.EXTRACTED,
        },
        create: {
          ...result,
          organizationId: input.organizationId,
          projectId: input.projectId,
          fileId: input.fileId,
          extractionStatus: OfferExtractionStatus.EXTRACTED,
        },
      });
      await transaction.uploadedFile.update({
        where: { id: input.fileId },
        data: { processingStatus: FileProcessingStatus.COMPLETED },
      });
    });
  }
}

