-- AlterTable
ALTER TABLE "SiteNotification" ADD COLUMN "labSetId" TEXT;

-- CreateTable
CREATE TABLE "LabReminderSent" (
    "id" TEXT NOT NULL,
    "labSetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabReminderSent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LabReminderSent_labSetId_idx" ON "LabReminderSent"("labSetId");

-- CreateIndex
CREATE INDEX "LabReminderSent_userId_idx" ON "LabReminderSent"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LabReminderSent_labSetId_userId_kind_key" ON "LabReminderSent"("labSetId", "userId", "kind");

-- CreateIndex
CREATE INDEX "SiteNotification_userId_type_idx" ON "SiteNotification"("userId", "type");

-- AddForeignKey
ALTER TABLE "SiteNotification" ADD CONSTRAINT "SiteNotification_labSetId_fkey" FOREIGN KEY ("labSetId") REFERENCES "LabSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabReminderSent" ADD CONSTRAINT "LabReminderSent_labSetId_fkey" FOREIGN KEY ("labSetId") REFERENCES "LabSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabReminderSent" ADD CONSTRAINT "LabReminderSent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
