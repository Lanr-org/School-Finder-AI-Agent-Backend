-- CreateTable
CREATE TABLE "recommendation_weights" (
    "id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "program_weight" INTEGER NOT NULL,
    "budget_weight" INTEGER NOT NULL,
    "intake_weight" INTEGER NOT NULL,
    "visa_weight" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recommendation_weights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendation_runs" (
    "id" UUID NOT NULL,
    "public_id" VARCHAR(24) NOT NULL,
    "student_id" UUID NOT NULL,
    "weights_version" INTEGER NOT NULL,
    "scoring_version" VARCHAR(20) NOT NULL,
    "student_snapshot" JSONB NOT NULL,
    "generated_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recommendation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendations" (
    "id" UUID NOT NULL,
    "public_id" VARCHAR(24) NOT NULL,
    "run_id" UUID NOT NULL,
    "program_id" UUID NOT NULL,
    "program_fit" DECIMAL(5,2) NOT NULL,
    "budget_fit" DECIMAL(5,2) NOT NULL,
    "intake_fit" DECIMAL(5,2) NOT NULL,
    "visa_fit" DECIMAL(5,2) NOT NULL,
    "overall_score" DECIMAL(5,2) NOT NULL,
    "reasons" TEXT[],
    "missing_requirements" TEXT[],
    "program_snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_shortlists" (
    "student_id" UUID NOT NULL,
    "program_id" UUID NOT NULL,
    "added_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_shortlists_pkey" PRIMARY KEY ("student_id","program_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recommendation_weights_version_key" ON "recommendation_weights"("version");

-- CreateIndex
CREATE UNIQUE INDEX "recommendation_runs_public_id_key" ON "recommendation_runs"("public_id");

-- CreateIndex
CREATE INDEX "recommendation_runs_student_id_created_at_idx" ON "recommendation_runs"("student_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "recommendations_public_id_key" ON "recommendations"("public_id");

-- CreateIndex
CREATE INDEX "recommendations_run_id_overall_score_idx" ON "recommendations"("run_id", "overall_score" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "recommendations_run_id_program_id_key" ON "recommendations"("run_id", "program_id");

-- AddForeignKey
ALTER TABLE "recommendation_runs" ADD CONSTRAINT "recommendation_runs_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_runs" ADD CONSTRAINT "recommendation_runs_generated_by_fkey" FOREIGN KEY ("generated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "recommendation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_shortlists" ADD CONSTRAINT "student_shortlists_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_shortlists" ADD CONSTRAINT "student_shortlists_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
