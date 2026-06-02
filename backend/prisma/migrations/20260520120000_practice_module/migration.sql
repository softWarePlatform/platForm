-- CreateEnum
CREATE TYPE "PracticeQuestionType" AS ENUM ('CHOICE', 'FILL', 'SHORT_ANSWER', 'CODE');
CREATE TYPE "PracticeDifficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');
CREATE TYPE "PracticeSessionMode" AS ENUM ('SMART', 'BY_TAG', 'WRONG_BOOK', 'CUSTOM');
CREATE TYPE "PracticeSessionStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'GRADED');
CREATE TYPE "PracticeFeedbackType" AS ENUM ('STEM_ERROR', 'ANSWER_ERROR', 'EXPLANATION_ERROR', 'TOO_HARD', 'TOO_EASY', 'UNCLEAR', 'SUGGEST_KNOWLEDGE');
CREATE TYPE "PracticeFeedbackStatus" AS ENUM ('PENDING', 'FIXED', 'REJECTED', 'CLOSED');
CREATE TYPE "PracticeQuestionAuditStatus" AS ENUM ('APPROVED', 'PENDING_REVIEW');

-- AlterTable
ALTER TABLE "WrongBookEntry" ADD COLUMN "practiceQuestionId" TEXT;

-- CreateTable
CREATE TABLE "PracticeQuestion" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "type" "PracticeQuestionType" NOT NULL,
    "stem" TEXT NOT NULL,
    "optionsJson" TEXT,
    "answerJson" TEXT NOT NULL,
    "explanation" TEXT,
    "tagPath" TEXT NOT NULL,
    "difficulty" "PracticeDifficulty" NOT NULL DEFAULT 'MEDIUM',
    "language" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "totalTimeMs" INTEGER NOT NULL DEFAULT 0,
    "auditStatus" "PracticeQuestionAuditStatus" NOT NULL DEFAULT 'APPROVED',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PracticeQuestion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PracticeSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "mode" "PracticeSessionMode" NOT NULL,
    "tagFilter" TEXT,
    "configJson" TEXT,
    "status" "PracticeSessionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "score" DOUBLE PRECISION,
    "maxScore" INTEGER NOT NULL DEFAULT 0,
    "submittedAt" TIMESTAMP(3),
    "gradedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PracticeSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PracticeSessionItem" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "answerJson" TEXT,
    "correct" BOOLEAN,
    "score" DOUBLE PRECISION,
    "maxScore" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "resultJson" TEXT,
    "timeSpentMs" INTEGER,
    "aiHintCount" INTEGER NOT NULL DEFAULT 0,
    "aiHintsJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PracticeSessionItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PracticeQuestionFeedback" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "PracticeFeedbackType" NOT NULL,
    "description" TEXT NOT NULL,
    "screenshotPath" TEXT,
    "status" "PracticeFeedbackStatus" NOT NULL DEFAULT 'PENDING',
    "teacherReply" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PracticeQuestionFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PracticeQuestion_courseId_tagPath_idx" ON "PracticeQuestion"("courseId", "tagPath");
CREATE INDEX "PracticeQuestion_courseId_difficulty_idx" ON "PracticeQuestion"("courseId", "difficulty");
CREATE INDEX "PracticeSession_userId_courseId_idx" ON "PracticeSession"("userId", "courseId");
CREATE UNIQUE INDEX "PracticeSessionItem_sessionId_questionId_key" ON "PracticeSessionItem"("sessionId", "questionId");
CREATE INDEX "PracticeSessionItem_sessionId_idx" ON "PracticeSessionItem"("sessionId");
CREATE INDEX "PracticeQuestionFeedback_courseId_status_idx" ON "PracticeQuestionFeedback"("courseId", "status");
CREATE INDEX "PracticeQuestionFeedback_questionId_idx" ON "PracticeQuestionFeedback"("questionId");

-- AddForeignKey
ALTER TABLE "WrongBookEntry" ADD CONSTRAINT "WrongBookEntry_practiceQuestionId_fkey" FOREIGN KEY ("practiceQuestionId") REFERENCES "PracticeQuestion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PracticeQuestion" ADD CONSTRAINT "PracticeQuestion_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PracticeQuestion" ADD CONSTRAINT "PracticeQuestion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PracticeSession" ADD CONSTRAINT "PracticeSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PracticeSession" ADD CONSTRAINT "PracticeSession_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PracticeSessionItem" ADD CONSTRAINT "PracticeSessionItem_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PracticeSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PracticeSessionItem" ADD CONSTRAINT "PracticeSessionItem_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "PracticeQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PracticeQuestionFeedback" ADD CONSTRAINT "PracticeQuestionFeedback_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "PracticeQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PracticeQuestionFeedback" ADD CONSTRAINT "PracticeQuestionFeedback_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PracticeQuestionFeedback" ADD CONSTRAINT "PracticeQuestionFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PracticeQuestionFeedback" ADD CONSTRAINT "PracticeQuestionFeedback_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
