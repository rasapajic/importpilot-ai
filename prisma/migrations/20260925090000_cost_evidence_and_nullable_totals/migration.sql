ALTER TABLE "cost_calculations"
  ALTER COLUMN "shipping_cost" DROP NOT NULL,
  ALTER COLUMN "customs_duty_rate" DROP NOT NULL,
  ALTER COLUMN "customs_duty_amount" DROP NOT NULL,
  ALTER COLUMN "vat_rate" DROP NOT NULL,
  ALTER COLUMN "vat_amount" DROP NOT NULL,
  ALTER COLUMN "storage_cost" DROP NOT NULL,
  ALTER COLUMN "inspection_cost" DROP NOT NULL,
  ALTER COLUMN "other_costs" DROP NOT NULL,
  ALTER COLUMN "landed_cost_total" DROP NOT NULL,
  ALTER COLUMN "landed_cost_per_unit" DROP NOT NULL,
  ALTER COLUMN "target_selling_price" DROP NOT NULL,
  ALTER COLUMN "gross_margin_percent" DROP NOT NULL,
  ALTER COLUMN "break_even_price" DROP NOT NULL,
  ADD COLUMN "insurance_cost" DECIMAL(18,2),
  ADD COLUMN "freight_forwarding_cost" DECIMAL(18,2),
  ADD COLUMN "known_cost_total" DECIMAL(18,2),
  ADD COLUMN "required_cash_total" DECIMAL(18,2),
  ADD COLUMN "net_acquisition_cost" DECIMAL(18,2),
  ADD COLUMN "vat_treatment" VARCHAR(32) NOT NULL DEFAULT 'UNSURE',
  ADD COLUMN "cost_evidence" JSONB;

UPDATE "cost_calculations"
SET "known_cost_total" = "landed_cost_total"
WHERE "known_cost_total" IS NULL;
