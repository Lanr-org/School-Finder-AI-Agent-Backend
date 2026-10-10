-- CreateEnum
CREATE TYPE "VisaSponsorStatus" AS ENUM ('LICENSED', 'NOT_LISTED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ProgramVerificationStatus" AS ENUM ('UNVERIFIED', 'VERIFIED', 'NEEDS_RECHECK');

-- CreateEnum
CREATE TYPE "ProgramDataReportStatus" AS ENUM ('OPEN', 'RESOLVED');

-- AlterTable
ALTER TABLE "programs" ADD COLUMN     "evidence" JSONB,
ADD COLUMN     "fees_academic_year" VARCHAR(9),
ADD COLUMN     "last_checked_at" TIMESTAMPTZ(6),
ADD COLUMN     "source_url" VARCHAR(500),
ADD COLUMN     "verification_status" "ProgramVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
ADD COLUMN     "verified_at" TIMESTAMPTZ(6),
ADD COLUMN     "verified_by_id" UUID;

-- AlterTable
ALTER TABLE "schools" ADD COLUMN     "visa_sponsor_checked_at" TIMESTAMPTZ(6),
ADD COLUMN     "visa_sponsor_source" VARCHAR(120),
ADD COLUMN     "visa_sponsor_status" "VisaSponsorStatus" NOT NULL DEFAULT 'UNKNOWN';

-- CreateTable
CREATE TABLE "program_data_reports" (
    "id" UUID NOT NULL,
    "program_id" UUID NOT NULL,
    "reporter_id" UUID NOT NULL,
    "message" TEXT NOT NULL,
    "status" "ProgramDataReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolved_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),

    CONSTRAINT "program_data_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "program_data_reports_program_id_idx" ON "program_data_reports"("program_id");

-- CreateIndex
CREATE INDEX "program_data_reports_status_created_at_idx" ON "program_data_reports"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "programs_verification_status_idx" ON "programs"("verification_status");

-- AddForeignKey
ALTER TABLE "programs" ADD CONSTRAINT "programs_verified_by_id_fkey" FOREIGN KEY ("verified_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_data_reports" ADD CONSTRAINT "program_data_reports_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_data_reports" ADD CONSTRAINT "program_data_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_data_reports" ADD CONSTRAINT "program_data_reports_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
