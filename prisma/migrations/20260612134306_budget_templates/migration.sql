-- CreateTable
CREATE TABLE "BudgetTemplate" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BudgetTemplate_tenantId_idx" ON "BudgetTemplate"("tenantId");

-- AddForeignKey
ALTER TABLE "BudgetTemplate" ADD CONSTRAINT "BudgetTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
