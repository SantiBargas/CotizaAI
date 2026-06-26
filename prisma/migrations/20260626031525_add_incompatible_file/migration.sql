-- CreateTable
CREATE TABLE "IncompatibleFile" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncompatibleFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IncompatibleFile_tenantId_idx" ON "IncompatibleFile"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "IncompatibleFile_tenantId_sourceKey_key" ON "IncompatibleFile"("tenantId", "sourceKey");

-- AddForeignKey
ALTER TABLE "IncompatibleFile" ADD CONSTRAINT "IncompatibleFile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
