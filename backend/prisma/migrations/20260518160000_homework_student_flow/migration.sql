-- CreateEnum
CREATE TYPE "HomeworkAnswerMode" AS ENUM ('RICH_TEXT', 'FILE', 'RICH_TEXT_OR_FILE');
CREATE TYPE "HomeworkRedoGradePolicy" AS ENUM ('REPLACE', 'KEEP_MAX');
CREATE TYPE "HomeworkRedoRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable Homework
ALTER TABLE "Homework" ADD COLUMN "answerMode" "HomeworkAnswerMode" NOT NULL DEFAULT 'RICH_TEXT';
ALTER TABLE "Homework" ADD COLUMN "allowMultipleSubmits" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Homework" ADD COLUMN "requireAttachment" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Homework" ADD COLUMN "redoReasonRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Homework" ADD COLUMN "redoGradePolicy" "HomeworkRedoGradePolicy" NOT NULL DEFAULT 'KEEP_MAX';

-- AlterTable HomeworkSubmission
ALTER TABLE "HomeworkSubmission" ALTER COLUMN "content" SET DEFAULT '';
ALTER TABLE "HomeworkSubmission" ADD COLUMN "draftContent" TEXT;
ALTER TABLE "HomeworkSubmission" ADD COLUMN "requirementsReadAt" TIMESTAMP(3);
ALTER TABLE "HomeworkSubmission" ADD COLUMN "locked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "HomeworkSubmission" ADD COLUMN "submittedAt" TIMESTAMP(3);
ALTER TABLE "HomeworkSubmission" ADD COLUMN "returnReason" TEXT;
ALTER TABLE "HomeworkSubmission" ADD COLUMN "returnCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "HomeworkSubmission" ADD COLUMN "redoUsedCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "HomeworkSubmission" ADD COLUMN "isLate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "HomeworkSubmission" ADD COLUMN "lateDays" INTEGER;

-- CreateTable
CREATE TABLE "HomeworkSubmissionVersion" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isLate" BOOLEAN NOT NULL DEFAULT false,
    "lateDays" INTEGER,
    "score" DOUBLE PRECISION,
    "feedback" TEXT,
    "graded" BOOLEAN NOT NULL DEFAULT false,
    "released" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "HomeworkSubmissionVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HomeworkStudentFile" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "versionId" TEXT,
    "fileName" TEXT NOT NULL,
    "storedPath" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HomeworkStudentFile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HomeworkRedoRequest" (
    "id" TEXT NOT NULL,
    "homeworkId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT,
    "status" "HomeworkRedoRequestStatus" NOT NULL DEFAULT 'PENDING',
    "rejectReason" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HomeworkRedoRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HomeworkKnowledgeAnalysis" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HomeworkKnowledgeAnalysis_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WrongBookEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT,
    "homeworkId" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "mastered" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WrongBookEntry_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SiteNotification" ADD COLUMN "homeworkId" TEXT;

CREATE UNIQUE INDEX "HomeworkSubmissionVersion_submissionId_version_key" ON "HomeworkSubmissionVersion"("submissionId", "version");
CREATE INDEX "HomeworkSubmissionVersion_submissionId_idx" ON "HomeworkSubmissionVersion"("submissionId");
CREATE INDEX "HomeworkStudentFile_submissionId_idx" ON "HomeworkStudentFile"("submissionId");
CREATE INDEX "HomeworkRedoRequest_homeworkId_userId_idx" ON "HomeworkRedoRequest"("homeworkId", "userId");
CREATE UNIQUE INDEX "HomeworkKnowledgeAnalysis_submissionId_key" ON "HomeworkKnowledgeAnalysis"("submissionId");
CREATE INDEX "WrongBookEntry_userId_mastered_idx" ON "WrongBookEntry"("userId", "mastered");

ALTER TABLE "HomeworkSubmissionVersion" ADD CONSTRAINT "HomeworkSubmissionVersion_submissionId_fkey"
FOREIGN KEY ("submissionId") REFERENCES "HomeworkSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HomeworkStudentFile" ADD CONSTRAINT "HomeworkStudentFile_submissionId_fkey"
FOREIGN KEY ("submissionId") REFERENCES "HomeworkSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HomeworkStudentFile" ADD CONSTRAINT "HomeworkStudentFile_versionId_fkey"
FOREIGN KEY ("versionId") REFERENCES "HomeworkSubmissionVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "HomeworkRedoRequest" ADD CONSTRAINT "HomeworkRedoRequest_homeworkId_fkey"
FOREIGN KEY ("homeworkId") REFERENCES "Homework"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HomeworkRedoRequest" ADD CONSTRAINT "HomeworkRedoRequest_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HomeworkRedoRequest" ADD CONSTRAINT "HomeworkRedoRequest_reviewedById_fkey"
FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "HomeworkKnowledgeAnalysis" ADD CONSTRAINT "HomeworkKnowledgeAnalysis_submissionId_fkey"
FOREIGN KEY ("submissionId") REFERENCES "HomeworkSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WrongBookEntry" ADD CONSTRAINT "WrongBookEntry_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SiteNotification" ADD CONSTRAINT "SiteNotification_homeworkId_fkey"
FOREIGN KEY ("homeworkId") REFERENCES "Homework"("id") ON DELETE SET NULL ON UPDATE CASCADE;
