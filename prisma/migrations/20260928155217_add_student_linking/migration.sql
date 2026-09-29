-- AlterEnum
ALTER TYPE "StudentIdentityProvider" ADD VALUE 'TELEGRAM';

-- AlterTable
ALTER TABLE "student_identities" ALTER COLUMN "email" DROP NOT NULL;

-- CreateTable
CREATE TABLE "student_link_tokens" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "redeem_with" "StudentIdentityProvider" NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_link_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "student_link_tokens_token_hash_key" ON "student_link_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "student_link_tokens_student_id_idx" ON "student_link_tokens"("student_id");

-- AddForeignKey
ALTER TABLE "student_link_tokens" ADD CONSTRAINT "student_link_tokens_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
