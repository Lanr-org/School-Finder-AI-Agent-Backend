-- CreateEnum
CREATE TYPE "StudyLevel" AS ENUM ('UNDERGRADUATE', 'POSTGRADUATE', 'DOCTORATE', 'FOUNDATION');

-- CreateEnum
CREATE TYPE "IntakeSeason" AS ENUM ('FALL', 'SPRING', 'SUMMER', 'WINTER');

-- CreateTable
CREATE TABLE "programs" (
    "id" UUID NOT NULL,
    "public_id" VARCHAR(24) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "study_level" "StudyLevel" NOT NULL,
    "qualification" VARCHAR(100) NOT NULL,
    "category" VARCHAR(120) NOT NULL,
    "duration" VARCHAR(50) NOT NULL,
    "school_id" UUID NOT NULL,
    "tuition_amount" DECIMAL(10,2) NOT NULL,
    "tuition_currency" VARCHAR(3) NOT NULL,
    "scholarship_availability" VARCHAR(100),
    "intake_periods" "IntakeSeason"[],
    "application_deadline" TIMESTAMP(3),
    "primary_intake_year" INTEGER,
    "academic_requirements" TEXT,
    "english_requirements" TEXT,
    "operation_notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "programs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "programs_public_id_key" ON "programs"("public_id");

-- CreateIndex
CREATE INDEX "programs_school_id_idx" ON "programs"("school_id");

-- CreateIndex
CREATE INDEX "programs_study_level_idx" ON "programs"("study_level");

-- CreateIndex
CREATE INDEX "programs_category_idx" ON "programs"("category");

-- AddForeignKey
ALTER TABLE "programs" ADD CONSTRAINT "programs_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
