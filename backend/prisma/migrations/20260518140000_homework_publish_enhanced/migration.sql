-- CreateEnum
CREATE TYPE "HomeworkSubmissionType" AS ENUM ('INDIVIDUAL', 'GROUP');

-- AlterTable
ALTER TABLE "Homework" ADD COLUMN "descriptionMd" TEXT;
ALTER TABLE "Homework" ADD COLUMN "allowLate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Homework" ADD COLUMN "latePenaltyPercentPerDay" DOUBLE PRECISION;
ALTER TABLE "Homework" ADD COLUMN "lateMaxDays" INTEGER;
ALTER TABLE "Homework" ADD COLUMN "allowRedo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Homework" ADD COLUMN "maxRedoCount" INTEGER;
ALTER TABLE "Homework" ADD COLUMN "submissionType" "HomeworkSubmissionType" NOT NULL DEFAULT 'INDIVIDUAL';
ALTER TABLE "Homework" ADD COLUMN "maxGroupSize" INTEGER;
ALTER TABLE "Homework" ADD COLUMN "rubricJson" TEXT;
ALTER TABLE "Homework" ADD COLUMN "rubricStoredPath" TEXT;
ALTER TABLE "Homework" ADD COLUMN "rubricFileName" TEXT;
ALTER TABLE "Homework" ADD COLUMN "requirementsUpdatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "HomeworkAttachment" (
    "id" TEXT NOT NULL,
    "homeworkId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storedPath" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HomeworkAttachment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HomeworkRevision" (
    "id" TEXT NOT NULL,
    "homeworkId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "snapshotJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HomeworkRevision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HomeworkAttachment_homeworkId_idx" ON "HomeworkAttachment"("homeworkId");
CREATE INDEX "HomeworkRevision_homeworkId_idx" ON "HomeworkRevision"("homeworkId");

ALTER TABLE "HomeworkAttachment" ADD CONSTRAINT "HomeworkAttachment_homeworkId_fkey"
FOREIGN KEY ("homeworkId") REFERENCES "Homework"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HomeworkRevision" ADD CONSTRAINT "HomeworkRevision_homeworkId_fkey"
FOREIGN KEY ("homeworkId") REFERENCES "Homework"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HomeworkRevision" ADD CONSTRAINT "HomeworkRevision_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
