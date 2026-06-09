-- CreateTable
CREATE TABLE "AnnouncementMark" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnouncementMark_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnnouncementMark_userId_idx" ON "AnnouncementMark"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AnnouncementMark_announcementId_userId_key" ON "AnnouncementMark"("announcementId", "userId");

-- AddForeignKey
ALTER TABLE "AnnouncementMark" ADD CONSTRAINT "AnnouncementMark_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "CourseAnnouncement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementMark" ADD CONSTRAINT "AnnouncementMark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
