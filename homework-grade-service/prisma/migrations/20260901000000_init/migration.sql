-- CreateEnum
CREATE TYPE "HomeworkSubmissionType" AS ENUM ('INDIVIDUAL', 'GROUP');

-- CreateEnum
CREATE TYPE "HomeworkAnswerMode" AS ENUM ('RICH_TEXT', 'FILE', 'RICH_TEXT_OR_FILE');

-- CreateEnum
CREATE TYPE "HomeworkRedoGradePolicy" AS ENUM ('REPLACE', 'KEEP_MAX');

-- CreateEnum
CREATE TYPE "HomeworkRedoRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "Homework" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "targetClassId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "descriptionMd" TEXT,
    "dueAt" TIMESTAMP(3),
    "published" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "allowLate" BOOLEAN NOT NULL DEFAULT false,
    "latePenaltyPercentPerDay" DOUBLE PRECISION,
    "lateMaxDays" INTEGER,
    "allowRedo" BOOLEAN NOT NULL DEFAULT false,
    "maxRedoCount" INTEGER,
    "submissionType" "HomeworkSubmissionType" NOT NULL DEFAULT 'INDIVIDUAL',
    "maxGroupSize" INTEGER,
    "answerMode" "HomeworkAnswerMode" NOT NULL DEFAULT 'RICH_TEXT',
    "allowMultipleSubmits" BOOLEAN NOT NULL DEFAULT false,
    "requireAttachment" BOOLEAN NOT NULL DEFAULT false,
    "redoReasonRequired" BOOLEAN NOT NULL DEFAULT false,
    "redoGradePolicy" "HomeworkRedoGradePolicy" NOT NULL DEFAULT 'KEEP_MAX',
    "rubricJson" TEXT,
    "rubricStoredPath" TEXT,
    "rubricFileName" TEXT,
    "requirementsUpdatedAt" TIMESTAMP(3),

    CONSTRAINT "Homework_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "HomeworkRevision" (
    "id" TEXT NOT NULL,
    "homeworkId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "snapshotJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HomeworkRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HomeworkSubmission" (
    "id" TEXT NOT NULL,
    "homeworkId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "draftContent" TEXT,
    "requirementsReadAt" TIMESTAMP(3),
    "score" DOUBLE PRECISION,
    "feedback" TEXT,
    "graded" BOOLEAN NOT NULL DEFAULT false,
    "released" BOOLEAN NOT NULL DEFAULT false,
    "releasedAt" TIMESTAMP(3),
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" TIMESTAMP(3),
    "returnReason" TEXT,
    "returnCount" INTEGER NOT NULL DEFAULT 0,
    "redoUsedCount" INTEGER NOT NULL DEFAULT 0,
    "isLate" BOOLEAN NOT NULL DEFAULT false,
    "lateDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomeworkSubmission_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
CREATE TABLE "HomeworkKnowledgeAnalysis" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomeworkKnowledgeAnalysis_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "GradingConfig" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "labWeight" DECIMAL(4,3) NOT NULL,
    "homeworkWeight" DECIMAL(4,3) NOT NULL,
    "updatedById" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GradingConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HomeworkSubmission_homeworkId_userId_key" ON "HomeworkSubmission"("homeworkId", "userId");
CREATE UNIQUE INDEX "HomeworkSubmissionVersion_submissionId_version_key" ON "HomeworkSubmissionVersion"("submissionId", "version");
CREATE UNIQUE INDEX "HomeworkKnowledgeAnalysis_submissionId_key" ON "HomeworkKnowledgeAnalysis"("submissionId");
CREATE UNIQUE INDEX "GradingConfig_courseId_key" ON "GradingConfig"("courseId");
CREATE INDEX "Homework_courseId_idx" ON "Homework"("courseId");
CREATE INDEX "HomeworkAttachment_homeworkId_idx" ON "HomeworkAttachment"("homeworkId");
CREATE INDEX "HomeworkRevision_homeworkId_idx" ON "HomeworkRevision"("homeworkId");
CREATE INDEX "HomeworkSubmissionVersion_submissionId_idx" ON "HomeworkSubmissionVersion"("submissionId");
CREATE INDEX "HomeworkStudentFile_submissionId_idx" ON "HomeworkStudentFile"("submissionId");
CREATE INDEX "HomeworkRedoRequest_homeworkId_userId_idx" ON "HomeworkRedoRequest"("homeworkId", "userId");
CREATE INDEX "HomeworkQuestion_homeworkId_idx" ON "HomeworkQuestion"("homeworkId");

ALTER TABLE "HomeworkAttachment" ADD CONSTRAINT "HomeworkAttachment_homeworkId_fkey" FOREIGN KEY ("homeworkId") REFERENCES "Homework"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HomeworkRevision" ADD CONSTRAINT "HomeworkRevision_homeworkId_fkey" FOREIGN KEY ("homeworkId") REFERENCES "Homework"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HomeworkSubmission" ADD CONSTRAINT "HomeworkSubmission_homeworkId_fkey" FOREIGN KEY ("homeworkId") REFERENCES "Homework"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HomeworkSubmissionVersion" ADD CONSTRAINT "HomeworkSubmissionVersion_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "HomeworkSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HomeworkStudentFile" ADD CONSTRAINT "HomeworkStudentFile_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "HomeworkSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HomeworkStudentFile" ADD CONSTRAINT "HomeworkStudentFile_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "HomeworkSubmissionVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HomeworkRedoRequest" ADD CONSTRAINT "HomeworkRedoRequest_homeworkId_fkey" FOREIGN KEY ("homeworkId") REFERENCES "Homework"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HomeworkKnowledgeAnalysis" ADD CONSTRAINT "HomeworkKnowledgeAnalysis_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "HomeworkSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HomeworkQuestion" ADD CONSTRAINT "HomeworkQuestion_homeworkId_fkey" FOREIGN KEY ("homeworkId") REFERENCES "Homework"("id") ON DELETE CASCADE ON UPDATE CASCADE;
