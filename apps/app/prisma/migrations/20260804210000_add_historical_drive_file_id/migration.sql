-- AlterTable
ALTER TABLE "HistoricalBudget" ADD COLUMN "driveFileId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "HistoricalBudget_tenantId_driveFileId_key" ON "HistoricalBudget"("tenantId", "driveFileId");
