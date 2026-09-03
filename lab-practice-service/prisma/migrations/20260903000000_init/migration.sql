-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('STUDENT', 'TEACHER', 'ADMIN');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('PENDING', 'JUDGING', 'ACCEPTED', 'WRONG_ANSWER', 'ERROR', 'TIMEOUT', 'PENDING_REVIEW');

-- CreateEnum
CREATE TYPE "SubmissionKind" AS ENUM ('CODE', 'FILE');

-- CreateEnum
CREATE TYPE "JudgeMode" AS ENUM ('AUTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "PracticeQuestionType" AS ENUM ('CHOICE', 'FILL', 'SHORT_ANSWER', 'CODE');

-- CreateEnum
CREATE TYPE "PracticeDifficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "PracticeSessionMode" AS ENUM ('SMART', 'BY_TAG', 'WRONG_BOOK', 'CUSTOM');

-- CreateEnum
CREATE TYPE "PracticeSessionStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'GRADED');

-- CreateEnum
CREATE TYPE "PracticeFeedbackType" AS ENUM ('STEM_ERROR', 'ANSWER_ERROR', 'EXPLANATION_ERROR', 'TOO_HARD', 'TOO_EASY', 'UNCLEAR', 'SUGGEST_KNOWLEDGE');

-- CreateEnum
CREATE TYPE "PracticeFeedbackStatus" AS ENUM ('PENDING', 'FIXED', 'REJECTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "PracticeQuestionAuditStatus" AS ENUM ('APPROVED', 'PENDING_REVIEW');

-- CreateEnum
CREATE TYPE "PracticeAnswerSource" AS ENUM ('TEACHER', 'AI');

-- CreateTable
CREATE TABLE "LabSet" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "allowMakeup" BOOLEAN NOT NULL DEFAULT false,
    "makeupDueAt" TIMESTAMP(3),
    "outsideAccessMode" TEXT NOT NULL DEFAULT 'BLOCK',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "allowedFileExtensions" TEXT[] DEFAULT ARRAY['.py', '.js', '.ts', '.java', '.cpp', '.c', '.txt']::TEXT[],
    "judgeMode" "JudgeMode" NOT NULL DEFAULT 'AUTO',
    "allowedLanguages" TEXT[] DEFAULT ARRAY['python', 'javascript']::TEXT[],
    "maxReturnCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabReminderSent" (
    "id" TEXT NOT NULL,
    "labSetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabReminderSent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lab" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "labSetId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "descriptionMd" TEXT,
    "language" TEXT NOT NULL,
    "starterCode" TEXT,
    "judgeMode" "JudgeMode",
    "allowedLanguages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allowedFileExtensions" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "Lab_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabFile" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storedPath" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestCase" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "input" TEXT NOT NULL,
    "expected" TEXT NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "weight" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "TestCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "labId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "submissionKind" "SubmissionKind" NOT NULL DEFAULT 'CODE',
    "language" TEXT,
    "code" TEXT NOT NULL DEFAULT '',
    "fileName" TEXT,
    "fileStoredPath" TEXT,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "score" DOUBLE PRECISION,
    "resultJson" TEXT,
    "teacherComment" TEXT,
    "returnReason" TEXT,
    "returnCount" INTEGER NOT NULL DEFAULT 0,
    "returnedAt" TIMESTAMP(3),
    "gradedById" TEXT,
    "gradedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticeQuestion" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "type" "PracticeQuestionType" NOT NULL,
    "stem" TEXT NOT NULL,
    "optionsJson" TEXT,
    "answerJson" TEXT NOT NULL,
    "explanation" TEXT,
    "answerSource" "PracticeAnswerSource" NOT NULL DEFAULT 'TEACHER',
    "answerConfirmed" BOOLEAN NOT NULL DEFAULT true,
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

-- CreateTable
CREATE TABLE "PracticeKnowledgeTag" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "tagPath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PracticeKnowledgeTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
CREATE TABLE "WrongBookEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT,
    "homeworkId" TEXT,
    "sourceKey" TEXT,
    "practiceQuestionId" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "mastered" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WrongBookEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscussionPost" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "labSetId" TEXT,
    "labId" TEXT,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscussionPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscussionComment" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "parentId" TEXT,
    "body" TEXT NOT NULL,
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscussionComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscussionAttachment" (
    "id" TEXT NOT NULL,
    "postId" TEXT,
    "commentId" TEXT,
    "fileName" TEXT NOT NULL,
    "storedPath" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscussionAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LabSet_courseId_idx" ON "LabSet"("courseId");

-- CreateIndex
CREATE INDEX "LabReminderSent_labSetId_idx" ON "LabReminderSent"("labSetId");

-- CreateIndex
CREATE INDEX "LabReminderSent_userId_idx" ON "LabReminderSent"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LabReminderSent_labSetId_userId_kind_key" ON "LabReminderSent"("labSetId", "userId", "kind");

-- CreateIndex
CREATE INDEX "Lab_courseId_idx" ON "Lab"("courseId");

-- CreateIndex
CREATE INDEX "Lab_labSetId_idx" ON "Lab"("labSetId");

-- CreateIndex
CREATE INDEX "LabFile_labId_idx" ON "LabFile"("labId");

-- CreateIndex
CREATE INDEX "LabFile_uploadedById_idx" ON "LabFile"("uploadedById");

-- CreateIndex
CREATE INDEX "TestCase_labId_idx" ON "TestCase"("labId");

-- CreateIndex
CREATE INDEX "Submission_labId_idx" ON "Submission"("labId");

-- CreateIndex
CREATE INDEX "Submission_userId_idx" ON "Submission"("userId");

-- CreateIndex
CREATE INDEX "Submission_gradedById_idx" ON "Submission"("gradedById");

-- CreateIndex
CREATE INDEX "PracticeQuestion_courseId_tagPath_idx" ON "PracticeQuestion"("courseId", "tagPath");

-- CreateIndex
CREATE INDEX "PracticeQuestion_courseId_difficulty_idx" ON "PracticeQuestion"("courseId", "difficulty");

-- CreateIndex
CREATE INDEX "PracticeQuestion_createdById_idx" ON "PracticeQuestion"("createdById");

-- CreateIndex
CREATE INDEX "PracticeKnowledgeTag_courseId_idx" ON "PracticeKnowledgeTag"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "PracticeKnowledgeTag_courseId_tagPath_key" ON "PracticeKnowledgeTag"("courseId", "tagPath");

-- CreateIndex
CREATE INDEX "PracticeSession_userId_courseId_idx" ON "PracticeSession"("userId", "courseId");

-- CreateIndex
CREATE INDEX "PracticeSessionItem_sessionId_idx" ON "PracticeSessionItem"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "PracticeSessionItem_sessionId_questionId_key" ON "PracticeSessionItem"("sessionId", "questionId");

-- CreateIndex
CREATE INDEX "PracticeQuestionFeedback_courseId_status_idx" ON "PracticeQuestionFeedback"("courseId", "status");

-- CreateIndex
CREATE INDEX "PracticeQuestionFeedback_questionId_idx" ON "PracticeQuestionFeedback"("questionId");

-- CreateIndex
CREATE INDEX "PracticeQuestionFeedback_userId_idx" ON "PracticeQuestionFeedback"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WrongBookEntry_sourceKey_key" ON "WrongBookEntry"("sourceKey");

-- CreateIndex
CREATE INDEX "WrongBookEntry_userId_mastered_idx" ON "WrongBookEntry"("userId", "mastered");

-- CreateIndex
CREATE INDEX "WrongBookEntry_courseId_idx" ON "WrongBookEntry"("courseId");

-- CreateIndex
CREATE INDEX "WrongBookEntry_homeworkId_idx" ON "WrongBookEntry"("homeworkId");

-- CreateIndex
CREATE INDEX "DiscussionPost_courseId_idx" ON "DiscussionPost"("courseId");

-- CreateIndex
CREATE INDEX "DiscussionPost_userId_idx" ON "DiscussionPost"("userId");

-- CreateIndex
CREATE INDEX "DiscussionPost_labId_idx" ON "DiscussionPost"("labId");

-- CreateIndex
CREATE INDEX "DiscussionPost_labSetId_idx" ON "DiscussionPost"("labSetId");

-- CreateIndex
CREATE INDEX "DiscussionComment_postId_idx" ON "DiscussionComment"("postId");

-- CreateIndex
CREATE INDEX "DiscussionComment_userId_idx" ON "DiscussionComment"("userId");

-- CreateIndex
CREATE INDEX "DiscussionComment_parentId_idx" ON "DiscussionComment"("parentId");

-- CreateIndex
CREATE INDEX "DiscussionAttachment_postId_idx" ON "DiscussionAttachment"("postId");

-- CreateIndex
CREATE INDEX "DiscussionAttachment_commentId_idx" ON "DiscussionAttachment"("commentId");

-- CreateIndex
CREATE INDEX "DiscussionAttachment_uploadedById_idx" ON "DiscussionAttachment"("uploadedById");

-- AddForeignKey
ALTER TABLE "LabReminderSent" ADD CONSTRAINT "LabReminderSent_labSetId_fkey" FOREIGN KEY ("labSetId") REFERENCES "LabSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lab" ADD CONSTRAINT "Lab_labSetId_fkey" FOREIGN KEY ("labSetId") REFERENCES "LabSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabFile" ADD CONSTRAINT "LabFile_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestCase" ADD CONSTRAINT "TestCase_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeSessionItem" ADD CONSTRAINT "PracticeSessionItem_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PracticeSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeSessionItem" ADD CONSTRAINT "PracticeSessionItem_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "PracticeQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeQuestionFeedback" ADD CONSTRAINT "PracticeQuestionFeedback_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "PracticeQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WrongBookEntry" ADD CONSTRAINT "WrongBookEntry_practiceQuestionId_fkey" FOREIGN KEY ("practiceQuestionId") REFERENCES "PracticeQuestion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscussionPost" ADD CONSTRAINT "DiscussionPost_labSetId_fkey" FOREIGN KEY ("labSetId") REFERENCES "LabSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscussionPost" ADD CONSTRAINT "DiscussionPost_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscussionComment" ADD CONSTRAINT "DiscussionComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "DiscussionPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscussionComment" ADD CONSTRAINT "DiscussionComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "DiscussionComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscussionAttachment" ADD CONSTRAINT "DiscussionAttachment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "DiscussionPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscussionAttachment" ADD CONSTRAINT "DiscussionAttachment_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "DiscussionComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
