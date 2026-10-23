-- CreateEnum
CREATE TYPE "SupplierConfirmationStatus" AS ENUM ('FOUND', 'PREPARED', 'SENT', 'RESPONSE_RECEIVED', 'DOCUMENTED');

-- CreateTable
CREATE TABLE "supplier_confirmations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "offer_id" UUID,
    "product_url" TEXT NOT NULL,
    "product_name" VARCHAR(300) NOT NULL,
    "status" "SupplierConfirmationStatus" NOT NULL,
    "subject" VARCHAR(500) NOT NULL,
    "body" TEXT NOT NULL,
    "response_note" TEXT NOT NULL DEFAULT '',
    "written_quote" TEXT NOT NULL DEFAULT '',
    "source_result" JSONB NOT NULL,
    "proposals" JSONB NOT NULL,
    "supplier_price_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "quantity_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "moq_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "variants_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "order_terms_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "transport_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "customs_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "vat_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "other_costs_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "additional_confirmation_required" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_confirmations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supplier_confirmations_organization_id_project_id_idx" ON "supplier_confirmations"("organization_id", "project_id");

-- CreateIndex
CREATE INDEX "supplier_confirmations_offer_id_idx" ON "supplier_confirmations"("offer_id");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_confirmations_organization_id_project_id_product_u_key" ON "supplier_confirmations"("organization_id", "project_id", "product_url");

-- CreateIndex
CREATE UNIQUE INDEX "import_projects_organization_id_id_key" ON "import_projects"("organization_id", "id");

-- AddForeignKey
ALTER TABLE "supplier_confirmations" ADD CONSTRAINT "supplier_confirmations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_confirmations" ADD CONSTRAINT "supplier_confirmations_organization_id_project_id_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "import_projects"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_confirmations" ADD CONSTRAINT "supplier_confirmations_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "supplier_offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

