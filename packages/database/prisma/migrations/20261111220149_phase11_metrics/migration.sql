-- CreateTable
CREATE TABLE "CommandUsage" (
    "hour" TIMESTAMP(3) NOT NULL,
    "guildId" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "totalDurationMs" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CommandUsage_pkey" PRIMARY KEY ("hour","guildId","command")
);

-- CreateTable
CREATE TABLE "MetricSample" (
    "name" TEXT NOT NULL,
    "takenAt" TIMESTAMP(3) NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "MetricSample_pkey" PRIMARY KEY ("name","takenAt")
);

-- CreateIndex
CREATE INDEX "CommandUsage_hour_idx" ON "CommandUsage"("hour");

-- CreateIndex
CREATE INDEX "MetricSample_takenAt_idx" ON "MetricSample"("takenAt");
