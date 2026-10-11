-- AlterTable
ALTER TABLE "programs" ADD COLUMN     "source_check_failures" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "source_check_note" VARCHAR(200);
