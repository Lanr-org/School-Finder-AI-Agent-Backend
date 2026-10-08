-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('DRAFT', 'DOCUMENTS_PENDING', 'SUBMITTED', 'OFFER_RECEIVED', 'VISA_PROCESSING', 'COMPLETED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "StudentStatusChangeSource" AS ENUM ('LEAD_CREATED', 'MANUAL', 'ADVISOR_ASSIGNED', 'ADVISOR_UNASSIGNED', 'FOLLOW_UP_CREATED', 'APPLICATION_CREATED');

-- CreateTable
CREATE TABLE "student_applications" (
    "id" UUID NOT NULL,
    "public_id" VARCHAR(24) NOT NULL,
    "student_id" UUID NOT NULL,
    "program_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "intake_month" "IntakeMonth",
    "intake_year" INTEGER,
    "external_reference" VARCHAR(100),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "student_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_status_history" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "from_status" "ApplicationStatus",
    "to_status" "ApplicationStatus" NOT NULL,
    "changed_by" UUID,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_status_history" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "from_status" "StudentStatus",
    "to_status" "StudentStatus" NOT NULL,
    "source" "StudentStatusChangeSource" NOT NULL,
    "changed_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "student_applications_public_id_key" ON "student_applications"("public_id");

-- CreateIndex
CREATE INDEX "student_applications_student_id_created_at_idx" ON "student_applications"("student_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "student_applications_status_updated_at_idx" ON "student_applications"("status", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "student_applications_program_id_idx" ON "student_applications"("program_id");

-- CreateIndex
CREATE INDEX "application_status_history_application_id_created_at_idx" ON "application_status_history"("application_id", "created_at");

-- CreateIndex
CREATE INDEX "student_status_history_student_id_created_at_idx" ON "student_status_history"("student_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "student_applications" ADD CONSTRAINT "student_applications_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_applications" ADD CONSTRAINT "student_applications_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_applications" ADD CONSTRAINT "student_applications_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_status_history" ADD CONSTRAINT "application_status_history_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "student_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_status_history" ADD CONSTRAINT "application_status_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_status_history" ADD CONSTRAINT "student_status_history_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_status_history" ADD CONSTRAINT "student_status_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
