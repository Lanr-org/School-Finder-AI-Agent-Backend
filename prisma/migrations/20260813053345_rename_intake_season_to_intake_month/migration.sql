/*
  Warnings:

  - The `intake_periods` column on the `programs` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "IntakeMonth" AS ENUM ('JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER');

-- AlterTable
ALTER TABLE "programs" DROP COLUMN "intake_periods",
ADD COLUMN     "intake_periods" "IntakeMonth"[];

-- DropEnum
DROP TYPE "IntakeSeason";
