-- CreateTable
CREATE TABLE "program_intakes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "program_id" UUID NOT NULL,
    "month" "IntakeMonth" NOT NULL,
    "year" INTEGER NOT NULL,
    "application_deadline" TIMESTAMPTZ(6),

    CONSTRAINT "program_intakes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "program_intakes_program_id_month_year_key" ON "program_intakes"("program_id", "month", "year");

-- CreateIndex
CREATE INDEX "program_intakes_program_id_idx" ON "program_intakes"("program_id");

-- AddForeignKey
ALTER TABLE "program_intakes" ADD CONSTRAINT "program_intakes_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: Programs' flat intake_periods/application_deadline/primary_intake_year are replaced
-- by the program_intakes table above. This is test data (dev DB only) with no reliable per-month
-- year/deadline to backfill from the old shared single-year shape, so it is dropped, not migrated.
ALTER TABLE "programs" DROP COLUMN "intake_periods",
DROP COLUMN "application_deadline",
DROP COLUMN "primary_intake_year";

-- AlterTable: Student.target_intake was free text disconnected from the IntakeMonth enum
-- (e.g. "FALL 2026") and cannot be parsed into the new structured columns, so it is dropped.
ALTER TABLE "students" DROP COLUMN "target_intake",
ADD COLUMN "target_intake_month" "IntakeMonth",
ADD COLUMN "target_intake_year" INTEGER;
