-- ConversationMode: drop ESCALATED (redundant with ConversationStatus.ESCALATED — status
-- owns the lifecycle, mode only tracks who replies right now). No existing row uses it.
ALTER TYPE "ConversationMode" RENAME TO "ConversationMode_old";
CREATE TYPE "ConversationMode" AS ENUM ('AI_BOT', 'HUMAN_ADVISOR');
ALTER TABLE "conversations" ALTER COLUMN "mode" DROP DEFAULT;
ALTER TABLE "conversations" ALTER COLUMN "mode" TYPE "ConversationMode" USING ("mode"::text::"ConversationMode");
ALTER TABLE "conversations" ALTER COLUMN "mode" SET DEFAULT 'AI_BOT';
DROP TYPE "ConversationMode_old";

-- Add public_id to Conversations, matching the STU-/SCH-/PRG- public display ID convention.
ALTER TABLE "conversations" ADD COLUMN "public_id" VARCHAR(24);
UPDATE "conversations" SET "public_id" = 'CON-' || (1000 + floor(random() * 9000))::int WHERE "public_id" IS NULL;
ALTER TABLE "conversations" ALTER COLUMN "public_id" SET NOT NULL;
CREATE UNIQUE INDEX "conversations_public_id_key" ON "conversations"("public_id");
