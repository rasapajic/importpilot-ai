import type { UploadedFile } from "@prisma/client";

import type { SupplierOfferExtractionResult } from "@/modules/offers/domain/extraction-schema";

export type SaveExtractionInput = {
  organizationId: string;
  projectId: string;
  fileId: string;
  result: SupplierOfferExtractionResult;
};

export interface SupplierOfferExtractionWorker {
  extractText(file: UploadedFile): Promise<string>;
  extractSupplierOffer(text: string): Promise<SupplierOfferExtractionResult>;
  saveExtractionResult(input: SaveExtractionInput): Promise<void>;
}

