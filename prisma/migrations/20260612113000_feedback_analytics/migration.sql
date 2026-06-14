CREATE TYPE "ProjectCompletionStatus" AS ENUM ('ACTIVE', 'DECIDED', 'COMPLETED', 'ARCHIVED');
CREATE TYPE "ProjectOutcomeType" AS ENUM ('BOUGHT', 'NEGOTIATED', 'ABANDONED', 'POSTPONED');
CREATE TYPE "RecommendationFeedbackVote" AS ENUM ('HELPFUL', 'NOT_HELPFUL');

ALTER TYPE "ProjectActivityType" ADD VALUE 'PROJECT_OUTCOME_RECORDED';
ALTER TYPE "ProjectActivityType" ADD VALUE 'RECOMMENDATION_FEEDBACK_RECORDED';
ALTER TYPE "ProjectActivityType" ADD VALUE 'PROJECT_COMPLETION_CHANGED';

ALTER TABLE "import_projects"
ADD COLUMN "completion_status" "ProjectCompletionStatus" NOT NULL DEFAULT 'ACTIVE';

CREATE TABLE "project_outcomes" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "outcome" "ProjectOutcomeType" NOT NULL,
  "decision_status" "ProjectDecisionStatus",
  "final_price" DECIMAL(18,4),
  "final_currency" CHAR(3),
  "purchase_successful" BOOLEAN,
  "comment" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_outcomes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "recommendation_feedback" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "project_decision_id" UUID NOT NULL,
  "vote" "RecommendationFeedbackVote" NOT NULL,
  "comment" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "recommendation_feedback_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_completion_history" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "status" "ProjectCompletionStatus" NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_completion_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "import_projects_organization_id_completion_status_created_at_idx"
ON "import_projects"("organization_id", "completion_status", "created_at");
CREATE INDEX "project_outcomes_organization_id_project_id_created_at_idx"
ON "project_outcomes"("organization_id", "project_id", "created_at");
CREATE INDEX "project_outcomes_organization_id_decision_status_outcome_idx"
ON "project_outcomes"("organization_id", "decision_status", "outcome");
CREATE INDEX "recommendation_feedback_organization_id_project_id_created_at_idx"
ON "recommendation_feedback"("organization_id", "project_id", "created_at");
CREATE INDEX "recommendation_feedback_project_decision_id_created_at_idx"
ON "recommendation_feedback"("project_decision_id", "created_at");
CREATE INDEX "project_completion_history_organization_id_project_id_created_at_idx"
ON "project_completion_history"("organization_id", "project_id", "created_at");

ALTER TABLE "project_outcomes" ADD CONSTRAINT "project_outcomes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_outcomes" ADD CONSTRAINT "project_outcomes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "import_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recommendation_feedback" ADD CONSTRAINT "recommendation_feedback_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recommendation_feedback" ADD CONSTRAINT "recommendation_feedback_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "import_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recommendation_feedback" ADD CONSTRAINT "recommendation_feedback_project_decision_id_fkey" FOREIGN KEY ("project_decision_id") REFERENCES "project_decisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_completion_history" ADD CONSTRAINT "project_completion_history_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_completion_history" ADD CONSTRAINT "project_completion_history_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "import_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
