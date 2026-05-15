-- AlterTable
ALTER TABLE "DiscussionPost" ADD COLUMN     "labId" TEXT;

-- CreateIndex
CREATE INDEX "DiscussionPost_courseId_idx" ON "DiscussionPost"("courseId");

-- CreateIndex
CREATE INDEX "DiscussionPost_labId_idx" ON "DiscussionPost"("labId");

-- AddForeignKey
ALTER TABLE "DiscussionPost" ADD CONSTRAINT "DiscussionPost_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE CASCADE ON UPDATE CASCADE;
