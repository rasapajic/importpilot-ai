-- Draft migration for review. Apply only to an ephemeral test database.
-- Do not run this against staging or production.
-- CreateEnum
CREATE TYPE "SupplierInboxThreadStatus" AS ENUM ('DRAFT', 'APPROVED', 'SENT', 'RECEIVED', 'PARSED', 'NEEDS_CLARIFICATION', 'QUOTE_CONFIRMED', 'IN_COMPARISON');

-- CreateEnum
CREATE TYPE "SupplierOutboundKind" AS ENUM ('RFQ', 'FOLLOW_UP');

-- CreateEnum
CREATE TYPE "SupplierOutboundStatus" AS ENUM ('DRAFT', 'APPROVED', 'SENT', 'UNCERTAIN');

-- CreateEnum
CREATE TYPE "SupplierInboundSource" AS ENUM ('SYNTHETIC', 'WEBHOOK', 'FORWARD', 'MANUAL_IMPORT');

-- CreateEnum
CREATE TYPE "SupplierSenderTrust" AS ENUM ('ALIGNED', 'UNVERIFIED');

-- CreateEnum
CREATE TYPE "SupplierAttachmentScanStatus" AS ENUM ('PENDING', 'CLEAN', 'REJECTED');

-- CreateEnum
CREATE TYPE "SupplierQuoteReviewStatus" AS ENUM ('UNREVIEWED', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SupplierQuoteFieldFlag" AS ENUM ('NONE', 'MISSING', 'CONTRADICTION', 'SPEC_MISMATCH', 'LOW_CONFIDENCE');

-- CreateEnum
CREATE TYPE "SupplierReplyTokenStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "SupplierInboxEventType" AS ENUM ('THREAD_OPENED', 'RFQ_APPROVED', 'RFQ_SENT', 'REPLY_RECEIVED', 'PARSED', 'NEEDS_CLARIFICATION', 'QUARANTINED', 'TOKEN_REJECTED', 'FIELD_REVIEWED', 'SENDER_ACKNOWLEDGED', 'QUOTE_CONFIRMED', 'FOLLOW_UP_DRAFTED', 'FOLLOW_UP_APPROVED', 'FOLLOW_UP_APPROVAL_REJECTED', 'FOLLOW_UP_SEND_BLOCKED', 'INGESTION_DELAYED');

-- CreateTable
CREATE TABLE "supplier_inbox_threads" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "offer_id" UUID,
    "confirmation_id" UUID,
    "supplier_name" VARCHAR(200) NOT NULL,
    "status" "SupplierInboxThreadStatus" NOT NULL DEFAULT 'DRAFT',
    "reply_token_hash" CHAR(64) NOT NULL,
    "expected_supplier_email" VARCHAR(320),
    "ordered_quantity" INTEGER NOT NULL,
    "requirement" JSONB NOT NULL,
    "ingestion_delayed" BOOLEAN NOT NULL DEFAULT false,
    "unverified_sender_acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_inbox_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_inbox_reply_tokens" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "thread_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "status" "SupplierReplyTokenStatus" NOT NULL DEFAULT 'ACTIVE',
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_inbox_reply_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_outbound_messages" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "thread_id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "kind" "SupplierOutboundKind" NOT NULL,
    "status" "SupplierOutboundStatus" NOT NULL DEFAULT 'DRAFT',
    "from_address" VARCHAR(320) NOT NULL,
    "to_address" VARCHAR(320) NOT NULL,
    "reply_token_hash" CHAR(64) NOT NULL,
    "subject" VARCHAR(500) NOT NULL,
    "body" TEXT NOT NULL,
    "content_hash" CHAR(64) NOT NULL,
    "approval_hash" CHAR(64),
    "provider" VARCHAR(40),
    "provider_message_id" VARCHAR(200),
    "approved_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_outbound_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_inbound_messages" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "thread_id" UUID,
    "provider" VARCHAR(40) NOT NULL,
    "provider_message_id" VARCHAR(200) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL,
    "from_address" VARCHAR(320) NOT NULL,
    "subject" VARCHAR(500) NOT NULL DEFAULT '',
    "raw_sha256" CHAR(64) NOT NULL,
    "raw_object_key" VARCHAR(300) NOT NULL,
    "raw_message" TEXT NOT NULL,
    "original_text" TEXT NOT NULL,
    "sanitized_text" TEXT NOT NULL,
    "sender_trust" "SupplierSenderTrust",
    "authentication_results" JSONB,
    "source" "SupplierInboundSource" NOT NULL,
    "in_reply_to" VARCHAR(998),
    "references_header" TEXT,
    "quarantine_reason" VARCHAR(40),
    "retention_expires_at" TIMESTAMP(3),
    "parse_completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_inbound_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_inbound_attachments" (
    "id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "organization_id" UUID,
    "filename" VARCHAR(255) NOT NULL,
    "declared_mime" VARCHAR(127) NOT NULL,
    "detected_mime" VARCHAR(127) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "storage_key" VARCHAR(300) NOT NULL,
    "scan_status" "SupplierAttachmentScanStatus" NOT NULL,
    "rejection_reason" VARCHAR(80),
    "content" BYTEA,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_inbound_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_message_translations" (
    "id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "locale" VARCHAR(16) NOT NULL,
    "translated_text" TEXT NOT NULL,
    "model_id" VARCHAR(80) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_message_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_quote_extractions" (
    "id" UUID NOT NULL,
    "thread_id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "field_key" VARCHAR(80) NOT NULL,
    "value_json" JSONB NOT NULL,
    "confidence" DECIMAL(4,3) NOT NULL,
    "citation_snippet" TEXT NOT NULL,
    "citation_attachment_id" UUID,
    "citation_page" INTEGER,
    "flag" "SupplierQuoteFieldFlag" NOT NULL DEFAULT 'NONE',
    "review_status" "SupplierQuoteReviewStatus" NOT NULL DEFAULT 'UNREVIEWED',
    "reviewed_by_user_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_quote_extractions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_inbox_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "thread_id" UUID,
    "actor_user_id" UUID,
    "type" "SupplierInboxEventType" NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_inbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_ingestion_attempts" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "thread_id" UUID,
    "provider" VARCHAR(40) NOT NULL,
    "provider_message_id" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_ingestion_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "supplier_inbox_threads_reply_token_hash_key" ON "supplier_inbox_threads"("reply_token_hash");

-- CreateIndex
CREATE INDEX "supplier_inbox_threads_organization_id_project_id_idx" ON "supplier_inbox_threads"("organization_id", "project_id");

-- CreateIndex
CREATE INDEX "supplier_inbox_threads_offer_id_idx" ON "supplier_inbox_threads"("offer_id");

-- CreateIndex
CREATE INDEX "supplier_inbox_threads_confirmation_id_idx" ON "supplier_inbox_threads"("confirmation_id");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_inbox_reply_tokens_token_hash_key" ON "supplier_inbox_reply_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "supplier_inbox_reply_tokens_thread_id_status_idx" ON "supplier_inbox_reply_tokens"("thread_id", "status");

-- CreateIndex
CREATE INDEX "supplier_outbound_messages_organization_id_thread_id_idx" ON "supplier_outbound_messages"("organization_id", "thread_id");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_outbound_messages_provider_message_id_key" ON "supplier_outbound_messages"("provider", "provider_message_id");

-- CreateIndex
CREATE INDEX "supplier_inbound_messages_organization_id_thread_id_idx" ON "supplier_inbound_messages"("organization_id", "thread_id");

-- CreateIndex
CREATE INDEX "supplier_inbound_messages_retention_expires_at_idx" ON "supplier_inbound_messages"("retention_expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_inbound_messages_provider_message_id_key" ON "supplier_inbound_messages"("provider", "provider_message_id");

-- CreateIndex
CREATE INDEX "supplier_inbound_attachments_message_id_idx" ON "supplier_inbound_attachments"("message_id");

-- CreateIndex
CREATE INDEX "supplier_inbound_attachments_organization_id_idx" ON "supplier_inbound_attachments"("organization_id");

-- CreateIndex
CREATE INDEX "supplier_message_translations_organization_id_idx" ON "supplier_message_translations"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_message_translations_message_id_locale_key" ON "supplier_message_translations"("message_id", "locale");

-- CreateIndex
CREATE INDEX "supplier_quote_extractions_organization_id_thread_id_idx" ON "supplier_quote_extractions"("organization_id", "thread_id");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_quote_extractions_message_id_field_key_key" ON "supplier_quote_extractions"("message_id", "field_key");

-- CreateIndex
CREATE INDEX "supplier_inbox_events_org_thread_created_idx" ON "supplier_inbox_events"("organization_id", "thread_id", "created_at");

-- CreateIndex
CREATE INDEX "supplier_ingestion_attempts_provider_message_id_idx" ON "supplier_ingestion_attempts"("provider", "provider_message_id");

-- AddForeignKey
ALTER TABLE "supplier_inbox_threads" ADD CONSTRAINT "supplier_inbox_threads_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_inbox_threads" ADD CONSTRAINT "supplier_inbox_threads_organization_id_project_id_fkey" FOREIGN KEY ("organization_id", "project_id") REFERENCES "import_projects"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_inbox_threads" ADD CONSTRAINT "supplier_inbox_threads_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "supplier_offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_inbox_threads" ADD CONSTRAINT "supplier_inbox_threads_confirmation_id_fkey" FOREIGN KEY ("confirmation_id") REFERENCES "supplier_confirmations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_inbox_threads" ADD CONSTRAINT "supplier_inbox_threads_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_inbox_reply_tokens" ADD CONSTRAINT "supplier_inbox_reply_tokens_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_inbox_reply_tokens" ADD CONSTRAINT "supplier_inbox_reply_tokens_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "supplier_inbox_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_outbound_messages" ADD CONSTRAINT "supplier_outbound_messages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_outbound_messages" ADD CONSTRAINT "supplier_outbound_messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "supplier_inbox_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_outbound_messages" ADD CONSTRAINT "supplier_outbound_messages_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_inbound_messages" ADD CONSTRAINT "supplier_inbound_messages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_inbound_messages" ADD CONSTRAINT "supplier_inbound_messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "supplier_inbox_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_inbound_attachments" ADD CONSTRAINT "supplier_inbound_attachments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_inbound_attachments" ADD CONSTRAINT "supplier_inbound_attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "supplier_inbound_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_message_translations" ADD CONSTRAINT "supplier_message_translations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_message_translations" ADD CONSTRAINT "supplier_message_translations_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "supplier_inbound_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_quote_extractions" ADD CONSTRAINT "supplier_quote_extractions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_quote_extractions" ADD CONSTRAINT "supplier_quote_extractions_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "supplier_inbox_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_quote_extractions" ADD CONSTRAINT "supplier_quote_extractions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "supplier_inbound_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_quote_extractions" ADD CONSTRAINT "supplier_quote_extractions_citation_attachment_id_fkey" FOREIGN KEY ("citation_attachment_id") REFERENCES "supplier_inbound_attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_quote_extractions" ADD CONSTRAINT "supplier_quote_extractions_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_inbox_events" ADD CONSTRAINT "supplier_inbox_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_inbox_events" ADD CONSTRAINT "supplier_inbox_events_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "supplier_inbox_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_inbox_events" ADD CONSTRAINT "supplier_inbox_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_ingestion_attempts" ADD CONSTRAINT "supplier_ingestion_attempts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_ingestion_attempts" ADD CONSTRAINT "supplier_ingestion_attempts_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "supplier_inbox_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The stored supplier message is evidence. Later parses must not rewrite it.
CREATE OR REPLACE FUNCTION supplier_inbound_messages_raw_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.raw_message IS DISTINCT FROM OLD.raw_message
     OR NEW.raw_sha256 IS DISTINCT FROM OLD.raw_sha256
     OR NEW.raw_object_key IS DISTINCT FROM OLD.raw_object_key
     OR NEW.original_text IS DISTINCT FROM OLD.original_text
  THEN
    RAISE EXCEPTION 'inbound raw message is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER supplier_inbound_messages_raw_immutable
BEFORE UPDATE ON supplier_inbound_messages
FOR EACH ROW
EXECUTE FUNCTION supplier_inbound_messages_raw_immutable();
