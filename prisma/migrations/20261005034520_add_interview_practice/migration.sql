-- CreateEnum
CREATE TYPE "InterviewType" AS ENUM ('VISA', 'ADMISSION');

-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED');

-- CreateTable
CREATE TABLE "interview_sessions" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "type" "InterviewType" NOT NULL,
    "status" "InterviewStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "channel" "MessageChannel" NOT NULL,
    "target_country" VARCHAR(100),
    "program_label" VARCHAR(255),
    "question_count" INTEGER NOT NULL DEFAULT 5,
    "overall_score" DECIMAL(5,2),
    "summary" TEXT,
    "strengths" JSONB,
    "improvements" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "interview_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_answers" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "idx" INTEGER NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "tip" TEXT,
    "score" INTEGER,
    "answered_at" TIMESTAMPTZ(6),

    CONSTRAINT "interview_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "interview_sessions_student_id_status_idx" ON "interview_sessions"("student_id", "status");

-- CreateIndex
CREATE INDEX "interview_sessions_student_id_created_at_idx" ON "interview_sessions"("student_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "interview_answers_session_id_idx_key" ON "interview_answers"("session_id", "idx");

-- One in-progress interview per student (partial unique; Prisma can't express this)
CREATE UNIQUE INDEX "interview_sessions_one_in_progress_per_student" ON "interview_sessions"("student_id") WHERE "status" = 'IN_PROGRESS';

-- AddForeignKey
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_answers" ADD CONSTRAINT "interview_answers_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "interview_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
