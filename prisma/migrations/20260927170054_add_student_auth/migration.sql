-- CreateEnum
CREATE TYPE "StudentIdentityProvider" AS ENUM ('GOOGLE');

-- CreateTable
CREATE TABLE "student_identities" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "provider" "StudentIdentityProvider" NOT NULL,
    "subject" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login_at" TIMESTAMPTZ(6),

    CONSTRAINT "student_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_sessions" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "refresh_token_hash" VARCHAR(64) NOT NULL,
    "user_agent" TEXT,
    "ip_address" INET,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "last_used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "student_identities_email_idx" ON "student_identities"("email");

-- CreateIndex
CREATE UNIQUE INDEX "student_identities_provider_subject_key" ON "student_identities"("provider", "subject");

-- CreateIndex
CREATE UNIQUE INDEX "student_identities_student_id_provider_key" ON "student_identities"("student_id", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "student_sessions_refresh_token_hash_key" ON "student_sessions"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "student_sessions_student_id_idx" ON "student_sessions"("student_id");

-- AddForeignKey
ALTER TABLE "student_identities" ADD CONSTRAINT "student_identities_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_sessions" ADD CONSTRAINT "student_sessions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
