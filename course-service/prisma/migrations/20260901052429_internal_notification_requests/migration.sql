-- CreateTable
CREATE TABLE "InternalNotificationRequest" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InternalNotificationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InternalNotificationRequest_idempotencyKey_key" ON "InternalNotificationRequest"("idempotencyKey");

-- AddForeignKey
ALTER TABLE "InternalNotificationRequest" ADD CONSTRAINT "InternalNotificationRequest_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "SiteNotification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
