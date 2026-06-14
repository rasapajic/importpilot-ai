CREATE TYPE "SupplierOfferSource" AS ENUM ('MANUAL', 'FILE_EXTRACTION', 'SEARCH_RESULT');

ALTER TABLE "supplier_offers"
ADD COLUMN "source" "SupplierOfferSource" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN "source_metadata" JSONB;
