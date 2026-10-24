-- M1: isolated, tenant-scoped Gmail mailbox connection and send evidence.
-- No changes to existing supplier confirmation rows or commercial terms.
CREATE UNIQUE INDEX "supplier_confirmations_organization_id_id_key"
  ON "supplier_confirmations"("organization_id", "id");

CREATE TABLE "mailbox_connections" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "provider" VARCHAR(20) NOT NULL,
  "email_address" VARCHAR(320) NOT NULL,
  "encrypted_refresh_token" TEXT,
  "token_key_version" VARCHAR(40),
  "connected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "disconnected_at" TIMESTAMP(3),
  CONSTRAINT "mailbox_connections_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "mailbox_connections_organization_id_provider_email_addre_key"
  ON "mailbox_connections"("organization_id","provider","email_address");
CREATE UNIQUE INDEX "mailbox_connections_organization_id_id_key"
  ON "mailbox_connections"("organization_id","id");
CREATE INDEX "mailbox_connections_organization_id_user_id_disconnected_at_idx"
  ON "mailbox_connections"("organization_id","user_id","disconnected_at");
ALTER TABLE "mailbox_connections" ADD CONSTRAINT "mailbox_connections_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mailbox_connections" ADD CONSTRAINT "mailbox_connections_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "supplier_mail_outbounds" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "confirmation_id" UUID NOT NULL,
  "mailbox_connection_id" UUID NOT NULL,
  "from_address" VARCHAR(320) NOT NULL,
  "recipient_address" VARCHAR(320) NOT NULL,
  "subject" VARCHAR(500) NOT NULL,
  "content_hash" CHAR(64) NOT NULL,
  "rfc_message_id" VARCHAR(255) NOT NULL,
  "provider_message_id" VARCHAR(255),
  "provider_thread_id" VARCHAR(255),
  "status" VARCHAR(16) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sent_at" TIMESTAMP(3),
  CONSTRAINT "supplier_mail_outbounds_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "supplier_mail_outbounds_organization_id_confirmation_id_key"
  ON "supplier_mail_outbounds"("organization_id","confirmation_id");
CREATE UNIQUE INDEX "supplier_mail_outbounds_mailbox_connection_id_provider_message_key"
  ON "supplier_mail_outbounds"("mailbox_connection_id","provider_message_id");
CREATE INDEX "supplier_mail_outbounds_organization_id_status_created_at_idx"
  ON "supplier_mail_outbounds"("organization_id","status","created_at");
ALTER TABLE "supplier_mail_outbounds" ADD CONSTRAINT "supplier_mail_outbounds_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_mail_outbounds" ADD CONSTRAINT "supplier_mail_outbounds_organization_id_confirmation_id_fkey"
  FOREIGN KEY ("organization_id","confirmation_id")
  REFERENCES "supplier_confirmations"("organization_id","id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_mail_outbounds" ADD CONSTRAINT "supplier_mail_outbounds_organization_id_mailbox_connection_id_fkey"
  FOREIGN KEY ("organization_id","mailbox_connection_id")
  REFERENCES "mailbox_connections"("organization_id","id") ON DELETE RESTRICT ON UPDATE CASCADE;
