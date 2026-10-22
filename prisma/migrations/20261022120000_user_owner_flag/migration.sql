-- AlterTable
ALTER TABLE "users" ADD COLUMN "is_owner" BOOLEAN NOT NULL DEFAULT false;

-- At most one owner. Partial unique index: Prisma can't express it, so it lives here only.
CREATE UNIQUE INDEX "users_single_owner_key" ON "users" ("is_owner") WHERE "is_owner";

-- The owner is the first admin, the one created by the bootstrap script or seed.
UPDATE "users" SET "is_owner" = true
WHERE "id" = (
  SELECT "id" FROM "users"
  WHERE "role" = 'ADMIN' AND "status" = 'ACTIVE'
  ORDER BY "created_at" ASC
  LIMIT 1
);
