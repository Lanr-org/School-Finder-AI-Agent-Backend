-- CreateEnum
CREATE TYPE "AdvisorAvailability" AS ENUM ('AVAILABLE', 'LIMITED', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "FollowUpPriority" AS ENUM ('NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "FollowUpStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELED', 'OVERDUE');

-- AlterTable
ALTER TABLE "program_intakes" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "application_deadline" SET DATA TYPE TIMESTAMP(3);

-- CreateTable
CREATE TABLE "advisor_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "availability" "AdvisorAvailability" NOT NULL DEFAULT 'AVAILABLE',
    "max_capacity" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "advisor_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_notes" (
    "id" UUID NOT NULL,
    "public_id" VARCHAR(24) NOT NULL,
    "student_id" UUID NOT NULL,
    "advisor_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "student_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follow_ups" (
    "id" UUID NOT NULL,
    "public_id" VARCHAR(24) NOT NULL,
    "student_id" UUID NOT NULL,
    "advisor_id" UUID NOT NULL,
    "due_at" TIMESTAMPTZ(6) NOT NULL,
    "priority" "FollowUpPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "FollowUpStatus" NOT NULL DEFAULT 'PENDING',
    "description" TEXT NOT NULL,
    "completed_at" TIMESTAMP(3),
    "canceled_at" TIMESTAMP(3),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "follow_ups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "advisor_profiles_user_id_key" ON "advisor_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_notes_public_id_key" ON "student_notes"("public_id");

-- CreateIndex
CREATE INDEX "student_notes_student_id_created_at_idx" ON "student_notes"("student_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "follow_ups_public_id_key" ON "follow_ups"("public_id");

-- CreateIndex
CREATE INDEX "follow_ups_student_id_status_idx" ON "follow_ups"("student_id", "status");

-- CreateIndex
CREATE INDEX "follow_ups_advisor_id_status_due_at_idx" ON "follow_ups"("advisor_id", "status", "due_at");

-- AddForeignKey
ALTER TABLE "advisor_profiles" ADD CONSTRAINT "advisor_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_notes" ADD CONSTRAINT "student_notes_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_notes" ADD CONSTRAINT "student_notes_advisor_id_fkey" FOREIGN KEY ("advisor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_advisor_id_fkey" FOREIGN KEY ("advisor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
