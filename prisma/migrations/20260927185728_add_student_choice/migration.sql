-- AlterTable
ALTER TABLE "students" ADD COLUMN     "chosen_program_id" UUID,
ADD COLUMN     "study_plan_shared_at" TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX "students_chosen_program_id_idx" ON "students"("chosen_program_id");

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_chosen_program_id_fkey" FOREIGN KEY ("chosen_program_id") REFERENCES "programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
