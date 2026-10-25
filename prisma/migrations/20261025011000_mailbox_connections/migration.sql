-- Gmail M1b: connection metadata and AES-256-GCM encrypted credentials.
-- No existing tables/data are rewritten. Feature remains disabled until reviewed.
CREATE TABLE "mailbox_connections" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "connected_by_user_id" UUID NOT NULL,
  "provider" VARCHAR(20) NOT NULL,
  "provider_account_id" VARCHAR(255) NOT NULL,
  "mailbox_email" VARCHAR(320) NOT NULL,
  "encrypted_refresh_token" TEXT NOT NULL,
  "token_key_version" INTEGER NOT NULL DEFAULT 1,
  "granted_scopes" TEXT NOT NULL,
  "connected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "disconnected_at" TIMESTAMP(3),
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "mailbox_connections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mailbox_connections_org_provider_account_key"
  ON "mailbox_connections"("organization_id", "provider", "provider_account_id");

CREATE INDEX "mailbox_connections_org_provider_active_idx"
  ON "mailbox_connections"("organization_id", "provider", "disconnected_at");

CREATE INDEX "mailbox_connections_connected_by_idx"
  ON "mailbox_connections"("connected_by_user_id");

ALTER TABLE "mailbox_connections"
  ADD CONSTRAINT "mailbox_connections_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mailbox_connections"
  ADD CONSTRAINT "mailbox_connections_connected_by_user_id_fkey"
  FOREIGN KEY ("connected_by_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
