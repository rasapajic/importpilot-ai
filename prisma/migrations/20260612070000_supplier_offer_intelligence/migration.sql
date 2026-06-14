CREATE TYPE "RecommendationStatus" AS ENUM ('RECOMMENDED', 'OK_WITH_RISK', 'NEEDS_NEGOTIATION', 'NOT_RECOMMENDED');

ALTER TABLE "supplier_offers"
ADD COLUMN "supplier_verified" BOOLEAN,
ADD COLUMN "years_on_platform" INTEGER,
ADD COLUMN "response_rate_percent" DECIMAL(5,2),
ADD COLUMN "sample_available" BOOLEAN,
ADD COLUMN "terms_clarity_score" INTEGER,
ADD COLUMN "shipping_clarity_score" INTEGER,
ADD CONSTRAINT "supplier_offers_years_on_platform_check" CHECK ("years_on_platform" IS NULL OR "years_on_platform" >= 0),
ADD CONSTRAINT "supplier_offers_response_rate_check" CHECK ("response_rate_percent" IS NULL OR ("response_rate_percent" >= 0 AND "response_rate_percent" <= 100)),
ADD CONSTRAINT "supplier_offers_terms_clarity_check" CHECK ("terms_clarity_score" IS NULL OR ("terms_clarity_score" >= 0 AND "terms_clarity_score" <= 100)),
ADD CONSTRAINT "supplier_offers_shipping_clarity_check" CHECK ("shipping_clarity_score" IS NULL OR ("shipping_clarity_score" >= 0 AND "shipping_clarity_score" <= 100));

CREATE TABLE "offer_assessments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "offer_id" UUID NOT NULL,
    "cost_calculation_id" UUID,
    "supplier_risk_score" INTEGER NOT NULL,
    "offer_quality_score" INTEGER NOT NULL,
    "overall_score" INTEGER NOT NULL,
    "confidence_score" DECIMAL(5,2) NOT NULL,
    "recommendation_status" "RecommendationStatus" NOT NULL,
    "explanation" TEXT NOT NULL,
    "score_breakdown" JSONB NOT NULL,
    "assessment_version" VARCHAR(40) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "offer_assessments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "offer_assessments_scores_check" CHECK (
      "supplier_risk_score" BETWEEN 0 AND 100
      AND "offer_quality_score" BETWEEN 0 AND 100
      AND "overall_score" BETWEEN 0 AND 100
      AND "confidence_score" BETWEEN 0 AND 100
    )
);

CREATE INDEX "offer_assessments_organization_id_project_id_idx" ON "offer_assessments"("organization_id", "project_id");
CREATE INDEX "offer_assessments_offer_id_created_at_idx" ON "offer_assessments"("offer_id", "created_at");

ALTER TABLE "offer_assessments" ADD CONSTRAINT "offer_assessments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "offer_assessments" ADD CONSTRAINT "offer_assessments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "import_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "offer_assessments" ADD CONSTRAINT "offer_assessments_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "supplier_offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "offer_assessments" ADD CONSTRAINT "offer_assessments_cost_calculation_id_fkey" FOREIGN KEY ("cost_calculation_id") REFERENCES "cost_calculations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
