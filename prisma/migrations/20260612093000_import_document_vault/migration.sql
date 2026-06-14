CREATE TYPE "DocumentType" AS ENUM ('OFFER', 'PROFORMA', 'SHIPPING_QUOTE', 'PRODUCT_IMAGE', 'OTHER');

ALTER TABLE "uploaded_files"
ADD COLUMN "linked_offer_id" UUID,
ADD COLUMN "document_type" "DocumentType" NOT NULL DEFAULT 'OFFER';

CREATE INDEX "uploaded_files_organization_id_project_id_document_type_idx"
ON "uploaded_files"("organization_id", "project_id", "document_type");

CREATE INDEX "uploaded_files_linked_offer_id_created_at_idx"
ON "uploaded_files"("linked_offer_id", "created_at");

ALTER TABLE "uploaded_files"
ADD CONSTRAINT "uploaded_files_linked_offer_id_fkey"
FOREIGN KEY ("linked_offer_id") REFERENCES "supplier_offers"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
