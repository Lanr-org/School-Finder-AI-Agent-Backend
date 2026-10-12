-- AlterTable
ALTER TABLE "students" ADD COLUMN     "terms_accepted_at" TIMESTAMPTZ(6),
ADD COLUMN     "terms_version" VARCHAR(20);
