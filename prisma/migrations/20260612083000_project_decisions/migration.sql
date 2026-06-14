CREATE TYPE "ProjectDecisionStatus" AS ENUM ('READY_TO_BUY', 'NEGOTIATE_FIRST', 'NEED_MORE_OFFERS', 'DO_NOT_BUY');

CREATE TABLE "project_decisions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "selected_offer_id" UUID,
    "status" "ProjectDecisionStatus" NOT NULL,
    "decision_reason" TEXT NOT NULL,
    "action_checklist" JSONB NOT NULL,
    "summary_snapshot" JSONB NOT NULL,
    "decision_version" VARCHAR(40) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "project_decisions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "project_decisions_organization_id_project_id_idx" ON "project_decisions"("organization_id", "project_id");
CREATE INDEX "project_decisions_project_id_created_at_idx" ON "project_decisions"("project_id", "created_at");

ALTER TABLE "project_decisions" ADD CONSTRAINT "project_decisions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_decisions" ADD CONSTRAINT "project_decisions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "import_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_decisions" ADD CONSTRAINT "project_decisions_selected_offer_id_fkey" FOREIGN KEY ("selected_offer_id") REFERENCES "supplier_offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
