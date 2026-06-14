CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'COLLECTING_OFFERS', 'ANALYZING', 'READY');
CREATE TYPE "FileProcessingStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED');
CREATE TYPE "ProcessingJobType" AS ENUM ('OCR_EXTRACTION', 'AI_EXTRACTION', 'PROJECT_ANALYSIS');
CREATE TYPE "ProcessingJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'RETRY_SCHEDULED', 'COMPLETED', 'DEAD_LETTER');

CREATE TABLE "import_projects" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "target_country" CHAR(2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "target_margin" DECIMAL(5,2) NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "import_projects_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "import_projects_quantity_check" CHECK ("quantity" > 0),
    CONSTRAINT "import_projects_target_margin_check" CHECK ("target_margin" >= 0 AND "target_margin" <= 100),
    CONSTRAINT "import_projects_target_country_check" CHECK ("target_country" ~ '^[A-Z]{2}$')
);

CREATE TABLE "uploaded_files" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "original_filename" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(120) NOT NULL,
    "size" BIGINT NOT NULL,
    "checksum" CHAR(64) NOT NULL,
    "storage_key" VARCHAR(1024) NOT NULL,
    "processing_status" "FileProcessingStatus" NOT NULL DEFAULT 'QUEUED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "uploaded_files_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "uploaded_files_size_check" CHECK ("size" > 0),
    CONSTRAINT "uploaded_files_checksum_check" CHECK ("checksum" ~ '^[a-f0-9]{64}$')
);

CREATE TABLE "processing_jobs" (
    "id" UUID NOT NULL,
    "type" "ProcessingJobType" NOT NULL,
    "status" "ProcessingJobStatus" NOT NULL DEFAULT 'PENDING',
    "file_id" UUID,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMP(3),
    "last_error" TEXT,
    "dead_lettered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "processing_jobs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "processing_jobs_attempts_check" CHECK ("attempts" >= 0),
    CONSTRAINT "processing_jobs_max_attempts_check" CHECK ("max_attempts" > 0)
);

CREATE INDEX "import_projects_organization_id_created_at_id_idx" ON "import_projects"("organization_id", "created_at", "id");
CREATE INDEX "import_projects_organization_id_status_created_at_idx" ON "import_projects"("organization_id", "status", "created_at");
CREATE INDEX "import_projects_organization_id_target_country_idx" ON "import_projects"("organization_id", "target_country");
CREATE UNIQUE INDEX "uploaded_files_storage_key_key" ON "uploaded_files"("storage_key");
CREATE INDEX "uploaded_files_organization_id_project_id_idx" ON "uploaded_files"("organization_id", "project_id");
CREATE INDEX "uploaded_files_processing_status_created_at_idx" ON "uploaded_files"("processing_status", "created_at");
CREATE INDEX "processing_jobs_status_available_at_idx" ON "processing_jobs"("status", "available_at");
CREATE INDEX "processing_jobs_file_id_idx" ON "processing_jobs"("file_id");

ALTER TABLE "import_projects" ADD CONSTRAINT "import_projects_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "import_projects" ADD CONSTRAINT "import_projects_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "uploaded_files" ADD CONSTRAINT "uploaded_files_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "uploaded_files" ADD CONSTRAINT "uploaded_files_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "import_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "processing_jobs" ADD CONSTRAINT "processing_jobs_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "uploaded_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
