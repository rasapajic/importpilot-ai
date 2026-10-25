-- Gmail M1c: one durable send attempt per supplier confirmation.
-- Never resend an indeterminate Gmail request automatically.
-- No existing project, quotation or credential data is modified.
CREATE UNIQUE INDEX "supplier_confirmations_org_id_key"
  ON "supplier_confirmations"("organization_id", "id");

CREATE UNIQUE INDEX "mailbox_connections_org_id_key"
  ON "mailbox_connections"("organization_id", "id");

CREATE TYPE "SupplierMailDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'UNCERTAIN');

CREATE TABLE "supplier_mail_deliveries" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "confirmation_id" UUID NOT NULL,
  "mailbox_connection_id" UUID NOT NULL,
  "sent_by_user_id" UUID NOT NULL,
  "provider" VARCHAR(20) NOT NULL DEFAULT 'GMAIL',
  "status" "SupplierMailDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "sender_email" VARCHAR(320) NOT NULL,
  "recipient_email" VARCHAR(320) NOT NULL,
  "subject" VARCHAR(500) NOT NULL,
  "body_hash" CHAR(64) NOT NULL,
  "approved_hash" CHAR(64) NOT NULL,
  "rfc_message_id" VARCHAR(255) NOT NULL,
  "provider_message_id" VARCHAR(255),
  "provider_thread_id" VARCHAR(255),
  "sent_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "supplier_mail_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "supplier_mail_deliveries_rfc_message_id_key"
  ON "supplier_mail_deliveries"("rfc_message_id");

CREATE UNIQUE INDEX "supplier_mail_deliveries_org_confirmation_key"
  ON "supplier_mail_deliveries"("organization_id", "confirmation_id");

CREATE INDEX "supplier_mail_deliveries_org_status_created_idx"
  ON "supplier_mail_deliveries"("organization_id", "status", "created_at");

CREATE INDEX "supplier_mail_deliveries_mailbox_created_idx"
  ON "supplier_mail_deliveries"("mailbox_connection_id", "created_at");

ALTER TABLE "supplier_mail_deliveries"
  ADD CONSTRAINT "supplier_mail_deliveries_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "supplier_mail_deliveries"
  ADD CONSTRAINT "supplier_mail_deliveries_confirmation_fkey"
  FOREIGN KEY ("organization_id", "confirmation_id")
  REFERENCES "supplier_confirmations"("organization_id", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "supplier_mail_deliveries"
  ADD CONSTRAINT "supplier_mail_deliveries_mailbox_connection_fkey"
  FOREIGN KEY ("organization_id", "mailbox_connection_id")
  REFERENCES "mailbox_connections"("organization_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
