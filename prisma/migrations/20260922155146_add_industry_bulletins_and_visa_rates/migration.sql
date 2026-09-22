-- CreateTable
CREATE TABLE "industry_bulletins" (
    "id" UUID NOT NULL,
    "public_id" VARCHAR(24) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT NOT NULL,
    "source_partner" VARCHAR(120),
    "countries" TEXT[],
    "published_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "industry_bulletins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visa_success_rates" (
    "id" UUID NOT NULL,
    "public_id" VARCHAR(24) NOT NULL,
    "country" VARCHAR(120) NOT NULL,
    "source_partner" VARCHAR(120),
    "period_label" VARCHAR(60) NOT NULL,
    "success_rate" DECIMAL(5,2) NOT NULL,
    "sample_size" INTEGER,
    "published_at" TIMESTAMPTZ(6) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "visa_success_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "industry_bulletins_public_id_key" ON "industry_bulletins"("public_id");

-- CreateIndex
CREATE INDEX "industry_bulletins_is_active_expires_at_idx" ON "industry_bulletins"("is_active", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "visa_success_rates_public_id_key" ON "visa_success_rates"("public_id");

-- CreateIndex
CREATE INDEX "visa_success_rates_country_is_active_published_at_idx" ON "visa_success_rates"("country", "is_active", "published_at" DESC);

-- AddForeignKey
ALTER TABLE "industry_bulletins" ADD CONSTRAINT "industry_bulletins_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visa_success_rates" ADD CONSTRAINT "visa_success_rates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
