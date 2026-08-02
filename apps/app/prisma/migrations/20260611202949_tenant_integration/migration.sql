/*
  Warnings:

  - You are about to drop the column `embedding` on the `BudgetChunk` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('GOOGLE_DRIVE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'INTEGRATION_CONNECTED';
ALTER TYPE "AuditAction" ADD VALUE 'INTEGRATION_DISCONNECTED';

-- DropIndex
DROP INDEX "idx_budgetchunk_embedding";

-- AlterTable
ALTER TABLE "BudgetChunk" DROP COLUMN "embedding";

-- CreateTable
CREATE TABLE "TenantIntegration" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "accountEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TenantIntegration_tenantId_idx" ON "TenantIntegration"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantIntegration_tenantId_provider_key" ON "TenantIntegration"("tenantId", "provider");

-- AddForeignKey
ALTER TABLE "TenantIntegration" ADD CONSTRAINT "TenantIntegration_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
