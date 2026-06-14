CREATE TYPE "CalculationStatus" AS ENUM ('DRAFT', 'CALCULATED', 'NEEDS_REVIEW');

CREATE TABLE "cost_calculations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "offer_id" UUID NOT NULL,
    "target_country" CHAR(2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(18,4) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "incoterm" VARCHAR(20) NOT NULL,
    "shipping_cost" DECIMAL(18,2) NOT NULL,
    "customs_duty_rate" DECIMAL(7,4) NOT NULL,
    "customs_duty_amount" DECIMAL(18,2) NOT NULL,
    "vat_rate" DECIMAL(7,4) NOT NULL,
    "vat_amount" DECIMAL(18,2) NOT NULL,
    "storage_cost" DECIMAL(18,2) NOT NULL,
    "inspection_cost" DECIMAL(18,2) NOT NULL,
    "other_costs" DECIMAL(18,2) NOT NULL,
    "landed_cost_total" DECIMAL(18,2) NOT NULL,
    "landed_cost_per_unit" DECIMAL(18,2) NOT NULL,
    "target_selling_price" DECIMAL(18,2) NOT NULL,
    "gross_margin_percent" DECIMAL(8,4) NOT NULL,
    "break_even_price" DECIMAL(18,2) NOT NULL,
    "calculation_status" "CalculationStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "cost_calculations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cost_calculations_quantity_check" CHECK ("quantity" > 0),
    CONSTRAINT "cost_calculations_money_check" CHECK (
      "unit_price" >= 0 AND "shipping_cost" >= 0 AND "customs_duty_amount" >= 0
      AND "vat_amount" >= 0 AND "storage_cost" >= 0 AND "inspection_cost" >= 0
      AND "other_costs" >= 0 AND "landed_cost_total" >= 0 AND "landed_cost_per_unit" >= 0
      AND "target_selling_price" > 0 AND "break_even_price" >= 0
    ),
    CONSTRAINT "cost_calculations_rates_check" CHECK (
      "customs_duty_rate" >= 0 AND "customs_duty_rate" <= 500
      AND "vat_rate" >= 0 AND "vat_rate" <= 100
    ),
    CONSTRAINT "cost_calculations_country_check" CHECK ("target_country" ~ '^[A-Z]{2}$'),
    CONSTRAINT "cost_calculations_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$')
);

CREATE INDEX "cost_calculations_organization_id_project_id_idx" ON "cost_calculations"("organization_id", "project_id");
CREATE INDEX "cost_calculations_offer_id_created_at_idx" ON "cost_calculations"("offer_id", "created_at");

ALTER TABLE "cost_calculations" ADD CONSTRAINT "cost_calculations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cost_calculations" ADD CONSTRAINT "cost_calculations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "import_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cost_calculations" ADD CONSTRAINT "cost_calculations_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "supplier_offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
