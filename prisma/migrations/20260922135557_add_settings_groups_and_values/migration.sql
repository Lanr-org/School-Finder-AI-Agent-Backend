-- CreateTable
CREATE TABLE "setting_groups" (
    "id" UUID NOT NULL,
    "key" VARCHAR(60) NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "setting_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "setting_values" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "key" VARCHAR(160) NOT NULL,
    "label" VARCHAR(160) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "setting_values_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "setting_groups_key_key" ON "setting_groups"("key");

-- CreateIndex
CREATE INDEX "setting_values_group_id_is_active_idx" ON "setting_values"("group_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "setting_values_group_id_key_key" ON "setting_values"("group_id", "key");

-- AddForeignKey
ALTER TABLE "setting_values" ADD CONSTRAINT "setting_values_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "setting_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
