-- AlterTable
ALTER TABLE "supplier_confirmations"
  ADD COLUMN "source_message" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "target_language" VARCHAR(16),
  ADD COLUMN "translated_message" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "translation_input_hash" VARCHAR(64),
  ADD COLUMN "supplier_reply_original" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "supplier_reply_translation" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "reply_translation_hash" VARCHAR(64);
