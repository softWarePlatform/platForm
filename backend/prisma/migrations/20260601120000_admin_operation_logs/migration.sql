-- CreateTable
CREATE TABLE "AdminOperationLog" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "targetLabel" TEXT,
    "detailJson" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminOperationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminOperationLog_operatorId_createdAt_idx" ON "AdminOperationLog"("operatorId", "createdAt");
CREATE INDEX "AdminOperationLog_targetType_createdAt_idx" ON "AdminOperationLog"("targetType", "createdAt");
CREATE INDEX "AdminOperationLog_action_createdAt_idx" ON "AdminOperationLog"("action", "createdAt");

-- AddForeignKey
ALTER TABLE "AdminOperationLog" ADD CONSTRAINT "AdminOperationLog_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
