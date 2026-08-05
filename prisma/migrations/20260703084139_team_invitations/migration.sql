-- CreateTable
CREATE TABLE "team_invitations" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "invited_by_user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "canceled_at" TIMESTAMP(3),
    "sent_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_sent_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "send_count" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "team_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "team_invitations_token_hash_key" ON "team_invitations"("token_hash");

-- CreateIndex
CREATE INDEX "team_invitations_user_id_idx" ON "team_invitations"("user_id");

-- CreateIndex
CREATE INDEX "team_invitations_invited_by_user_id_idx" ON "team_invitations"("invited_by_user_id");

-- AddForeignKey
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
