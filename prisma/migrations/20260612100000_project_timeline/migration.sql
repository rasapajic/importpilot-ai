CREATE TYPE "ProjectActivityType" AS ENUM (
  'PROJECT_CREATED',
  'OFFER_ADDED',
  'LANDED_COST_CALCULATED',
  'ASSESSMENT_COMPLETED',
  'FINAL_DECISION_CREATED',
  'NEGOTIATION_MESSAGE_GENERATED',
  'NEGOTIATION_MESSAGE_SENT',
  'DOCUMENT_UPLOADED',
  'DOCUMENT_DELETED'
);

CREATE TABLE "project_activities" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "type" "ProjectActivityType" NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "description" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_activities_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "project_activities_organization_id_project_id_created_at_idx"
ON "project_activities"("organization_id", "project_id", "created_at");

CREATE INDEX "project_activities_organization_id_project_id_type_created_at_idx"
ON "project_activities"("organization_id", "project_id", "type", "created_at");

ALTER TABLE "project_activities"
ADD CONSTRAINT "project_activities_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_activities"
ADD CONSTRAINT "project_activities_project_id_fkey"
FOREIGN KEY ("project_id") REFERENCES "import_projects"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
