-- CreateTable
CREATE TABLE "GeneratorSession" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "messages" JSONB NOT NULL,
    "draftContent" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeneratorSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GeneratorSession_tenantId_userId_idx" ON "GeneratorSession"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "GeneratorSession_updatedAt_idx" ON "GeneratorSession"("updatedAt");

-- AddForeignKey
ALTER TABLE "GeneratorSession" ADD CONSTRAINT "GeneratorSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratorSession" ADD CONSTRAINT "GeneratorSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
