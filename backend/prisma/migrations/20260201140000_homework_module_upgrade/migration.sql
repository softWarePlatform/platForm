-- AlterTable
ALTER TABLE "Homework"
ADD COLUMN "targetClassId" TEXT,
ADD COLUMN "published" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "publishedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "HomeworkSubmission"
ADD COLUMN "released" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "releasedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "HomeworkQuestion" (
    "id" TEXT NOT NULL,
    "homeworkId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "answeredById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),
    CONSTRAINT "HomeworkQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HomeworkQuestion_homeworkId_idx" ON "HomeworkQuestion"("homeworkId");

-- AddForeignKey
ALTER TABLE "Homework" ADD CONSTRAINT "Homework_targetClassId_fkey"
FOREIGN KEY ("targetClassId") REFERENCES "Class"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "HomeworkQuestion" ADD CONSTRAINT "HomeworkQuestion_homeworkId_fkey"
FOREIGN KEY ("homeworkId") REFERENCES "Homework"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HomeworkQuestion" ADD CONSTRAINT "HomeworkQuestion_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HomeworkQuestion" ADD CONSTRAINT "HomeworkQuestion_answeredById_fkey"
FOREIGN KEY ("answeredById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

