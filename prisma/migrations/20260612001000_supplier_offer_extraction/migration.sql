CREATE TYPE "OfferExtractionStatus" AS ENUM ('PENDING', 'EXTRACTED', 'MANUAL', 'REVIEWED', 'FAILED');

CREATE TABLE "supplier_offers" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "file_id" UUID,
    "supplier_name" VARCHAR(200) NOT NULL,
    "supplier_country" CHAR(2),
    "contact_email" VARCHAR(320),
    "contact_phone" VARCHAR(60),
    "moq" INTEGER,
    "unit_price" DECIMAL(18,4),
    "currency" CHAR(3),
    "incoterm" VARCHAR(20),
    "delivery_time_days" INTEGER,
    "payment_terms" VARCHAR(500),
    "warranty" VARCHAR(500),
    "raw_extracted_text" TEXT,
    "extraction_status" "OfferExtractionStatus" NOT NULL DEFAULT 'PENDING',
    "confidence_score" DECIMAL(4,3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "supplier_offers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "supplier_offers_moq_check" CHECK ("moq" IS NULL OR "moq" > 0),
    CONSTRAINT "supplier_offers_unit_price_check" CHECK ("unit_price" IS NULL OR "unit_price" >= 0),
    CONSTRAINT "supplier_offers_delivery_time_days_check" CHECK ("delivery_time_days" IS NULL OR "delivery_time_days" >= 0),
    CONSTRAINT "supplier_offers_confidence_score_check" CHECK ("confidence_score" IS NULL OR ("confidence_score" >= 0 AND "confidence_score" <= 1)),
    CONSTRAINT "supplier_offers_supplier_country_check" CHECK ("supplier_country" IS NULL OR "supplier_country" ~ '^[A-Z]{2}$'),
    CONSTRAINT "supplier_offers_currency_check" CHECK ("currency" IS NULL OR "currency" ~ '^[A-Z]{3}$')
);

CREATE UNIQUE INDEX "supplier_offers_file_id_key" ON "supplier_offers"("file_id");
CREATE INDEX "supplier_offers_organization_id_project_id_idx" ON "supplier_offers"("organization_id", "project_id");
CREATE INDEX "supplier_offers_project_id_extraction_status_idx" ON "supplier_offers"("project_id", "extraction_status");

ALTER TABLE "supplier_offers" ADD CONSTRAINT "supplier_offers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_offers" ADD CONSTRAINT "supplier_offers_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "import_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_offers" ADD CONSTRAINT "supplier_offers_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "uploaded_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
