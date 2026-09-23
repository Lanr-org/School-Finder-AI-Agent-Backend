-- CreateEnum
CREATE TYPE "SchoolType" AS ENUM ('UNIVERSITY', 'COLLEGE', 'INSTITUTE', 'POLYTECHNIC');

-- CreateEnum
CREATE TYPE "SchoolRecordStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "PartnerStatus" AS ENUM ('PARTNER', 'PROSPECT', 'NON_PARTNER');

-- CreateTable
CREATE TABLE "schools" (
    "id" UUID NOT NULL,
    "public_id" VARCHAR(24) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "school_type" "SchoolType" NOT NULL,
    "record_status" "SchoolRecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "description" TEXT,
    "website" VARCHAR(255),
    "admissions_email" VARCHAR(255),
    "phone_numbers" TEXT[],
    "street_address" VARCHAR(255),
    "city" VARCHAR(120) NOT NULL,
    "country" VARCHAR(120) NOT NULL,
    "postal_code" VARCHAR(20),
    "partner_status" "PartnerStatus" NOT NULL DEFAULT 'PROSPECT',
    "visa_friendliness_score" INTEGER,
    "visa_friendliness_notes" TEXT,
    "admission_friendliness_score" INTEGER,
    "admission_friendliness_notes" TEXT,
    "ranking_reputation_notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "schools_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "schools_public_id_key" ON "schools"("public_id");

-- CreateIndex
CREATE INDEX "schools_country_city_idx" ON "schools"("country", "city");

-- CreateIndex
CREATE INDEX "schools_partner_status_idx" ON "schools"("partner_status");

-- CreateIndex
CREATE INDEX "schools_school_type_idx" ON "schools"("school_type");
