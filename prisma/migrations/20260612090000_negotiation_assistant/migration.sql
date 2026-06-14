CREATE TYPE "NegotiationTone" AS ENUM ('FORMAL', 'DIRECT', 'FRIENDLY');
CREATE TYPE "NegotiationMessageStatus" AS ENUM ('PROPOSED', 'SENT');
CREATE TYPE "NegotiationRequestType" AS ENUM ('LOWER_MOQ', 'BETTER_PRICE', 'CONFIRM_INCOTERM', 'CONFIRM_SHIPPING', 'REQUEST_SAMPLE', 'FINAL_PROFORMA_INVOICE');

CREATE TABLE "negotiation_messages" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "offer_id" UUID NOT NULL,
    "project_decision_id" UUID NOT NULL,
    "tone" "NegotiationTone" NOT NULL,
    "status" "NegotiationMessageStatus" NOT NULL DEFAULT 'PROPOSED',
    "request_types" "NegotiationRequestType"[] NOT NULL,
    "locked_facts" JSONB NOT NULL,
    "subject" VARCHAR(300) NOT NULL,
    "body" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "negotiation_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "negotiation_messages_organization_id_project_id_idx" ON "negotiation_messages"("organization_id", "project_id");
CREATE INDEX "negotiation_messages_project_id_created_at_idx" ON "negotiation_messages"("project_id", "created_at");
CREATE INDEX "negotiation_messages_offer_id_created_at_idx" ON "negotiation_messages"("offer_id", "created_at");

ALTER TABLE "negotiation_messages" ADD CONSTRAINT "negotiation_messages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "negotiation_messages" ADD CONSTRAINT "negotiation_messages_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "import_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "negotiation_messages" ADD CONSTRAINT "negotiation_messages_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "supplier_offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "negotiation_messages" ADD CONSTRAINT "negotiation_messages_project_decision_id_fkey" FOREIGN KEY ("project_decision_id") REFERENCES "project_decisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
