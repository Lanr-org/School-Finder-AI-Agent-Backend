-- CreateEnum
CREATE TYPE "JourneyCheckKey" AS ENUM ('DEPOSIT_PAID', 'ENGLISH_TEST_BOOKED', 'ENGLISH_SCORE_RECEIVED', 'FUNDS_PLAN_AGREED', 'FUNDS_DOCUMENTS_READY');

-- CreateTable
CREATE TABLE "student_journey_checks" (
    "student_id" UUID NOT NULL,
    "key" "JourneyCheckKey" NOT NULL,
    "done_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "done_by_user" UUID,

    CONSTRAINT "student_journey_checks_pkey" PRIMARY KEY ("student_id","key")
);

-- CreateTable
CREATE TABLE "study_plan_links" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "study_plan_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "student_journey_checks_done_by_user_idx" ON "student_journey_checks"("done_by_user");

-- CreateIndex
CREATE UNIQUE INDEX "study_plan_links_token_hash_key" ON "study_plan_links"("token_hash");

-- CreateIndex
CREATE INDEX "study_plan_links_student_id_idx" ON "study_plan_links"("student_id");

-- AddForeignKey
ALTER TABLE "student_journey_checks" ADD CONSTRAINT "student_journey_checks_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_journey_checks" ADD CONSTRAINT "student_journey_checks_done_by_user_fkey" FOREIGN KEY ("done_by_user") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_plan_links" ADD CONSTRAINT "study_plan_links_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
