-- CreateTable
CREATE TABLE "PracticeKnowledgeTag" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "tagPath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PracticeKnowledgeTag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PracticeKnowledgeTag_courseId_tagPath_key" ON "PracticeKnowledgeTag"("courseId", "tagPath");

-- CreateIndex
CREATE INDEX "PracticeKnowledgeTag_courseId_idx" ON "PracticeKnowledgeTag"("courseId");

-- AddForeignKey
ALTER TABLE "PracticeKnowledgeTag" ADD CONSTRAINT "PracticeKnowledgeTag_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
