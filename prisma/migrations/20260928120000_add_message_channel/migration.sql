-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('TELEGRAM', 'WEB');

-- Every message so far came through Telegram (the web chat was scripted and saved nothing).
ALTER TABLE "conversation_messages" ADD COLUMN "channel" "MessageChannel" NOT NULL DEFAULT 'TELEGRAM';

-- No default from here on: every write must say which channel it used.
ALTER TABLE "conversation_messages" ALTER COLUMN "channel" DROP DEFAULT;
