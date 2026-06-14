ALTER TABLE "supplier_offers"
  ADD COLUMN "transaction_count" INTEGER,
  ADD COLUMN "employee_count" INTEGER,
  ADD COLUMN "profile_completeness_score" INTEGER;

ALTER TABLE "supplier_offers"
  ADD CONSTRAINT "supplier_offers_transaction_count_check" CHECK ("transaction_count" IS NULL OR "transaction_count" >= 0),
  ADD CONSTRAINT "supplier_offers_employee_count_check" CHECK ("employee_count" IS NULL OR "employee_count" >= 0),
  ADD CONSTRAINT "supplier_offers_profile_completeness_score_check" CHECK ("profile_completeness_score" IS NULL OR ("profile_completeness_score" >= 0 AND "profile_completeness_score" <= 100));
