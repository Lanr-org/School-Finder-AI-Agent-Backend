-- CreateEnum
CREATE TYPE "ContactProvider" AS ENUM ('TELEGRAM', 'WHATSAPP', 'LIVE_CHAT', 'FACEBOOK', 'MANUAL');

-- CreateEnum
CREATE TYPE "StudentStatus" AS ENUM ('NEW', 'AWAITING_ASSIGNMENT', 'ASSIGNED', 'FOLLOW_UP', 'APPLICATION_STARTED', 'COMPLETED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ConversationMode" AS ENUM ('AI_BOT', 'HUMAN_ADVISOR', 'ESCALATED');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('ACTIVE', 'ESCALATED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "MessageSenderType" AS ENUM ('STUDENT', 'AGENT', 'ADVISOR', 'SYSTEM');

-- CreateTable
CREATE TABLE "contacts" (
    "id" UUID NOT NULL,
    "provider_type" "ContactProvider" NOT NULL DEFAULT 'TELEGRAM',
    "provider_user_id" VARCHAR(100) NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100),
    "username" VARCHAR(100),
    "email" VARCHAR(255),
    "phone" VARCHAR(40),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" UUID NOT NULL,
    "public_id" VARCHAR(24) NOT NULL,
    "contact_id" UUID NOT NULL,
    "assigned_advisor_id" UUID,
    "status" "StudentStatus" NOT NULL DEFAULT 'NEW',
    "study_level" VARCHAR(50),
    "target_destinations" TEXT[],
    "target_intake" VARCHAR(50),
    "budget_range" VARCHAR(100),
    "academic_background" TEXT,
    "english_test_score" VARCHAR(100),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "mode" "ConversationMode" NOT NULL DEFAULT 'AI_BOT',
    "status" "ConversationStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_activity_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "sender_type" "MessageSenderType" NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contacts_provider_user_id_idx" ON "contacts"("provider_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_provider_type_provider_user_id_key" ON "contacts"("provider_type", "provider_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "students_public_id_key" ON "students"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "students_contact_id_key" ON "students"("contact_id");

-- CreateIndex
CREATE INDEX "students_assigned_advisor_id_idx" ON "students"("assigned_advisor_id");

-- CreateIndex
CREATE INDEX "students_status_created_at_idx" ON "students"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "conversations_student_id_idx" ON "conversations"("student_id");

-- CreateIndex
CREATE INDEX "conversations_mode_status_idx" ON "conversations"("mode", "status");

-- CreateIndex
CREATE INDEX "conversation_messages_conversation_id_created_at_idx" ON "conversation_messages"("conversation_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
