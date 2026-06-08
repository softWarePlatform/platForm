-- CreateEnum
CREATE TYPE "SubmissionKind" AS ENUM ('CODE', 'FILE');

-- CreateEnum
CREATE TYPE "JudgeMode" AS ENUM ('AUTO', 'MANUAL');

-- AlterEnum
ALTER TYPE "SubmissionStatus" ADD VALUE 'PENDING_REVIEW';

-- AlterTable LabSet
ALTER TABLE "LabSet" ADD COLUMN "allowedFileExtensions" TEXT[] DEFAULT ARRAY['.py', '.js', '.ts', '.java', '.cpp', '.c', '.txt']::TEXT[];
ALTER TABLE "LabSet" ADD COLUMN "judgeMode" "JudgeMode" NOT NULL DEFAULT 'AUTO';
ALTER TABLE "LabSet" ADD COLUMN "allowedLanguages" TEXT[] DEFAULT ARRAY['python', 'javascript']::TEXT[];

-- AlterTable Lab
ALTER TABLE "Lab" ADD COLUMN "judgeMode" "JudgeMode";
ALTER TABLE "Lab" ADD COLUMN "allowedLanguages" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Lab" ADD COLUMN "allowedFileExtensions" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable Submission
ALTER TABLE "Submission" ADD COLUMN "submissionKind" "SubmissionKind" NOT NULL DEFAULT 'CODE';
ALTER TABLE "Submission" ADD COLUMN "language" TEXT;
ALTER TABLE "Submission" ADD COLUMN "fileName" TEXT;
ALTER TABLE "Submission" ADD COLUMN "fileStoredPath" TEXT;
ALTER TABLE "Submission" ADD COLUMN "teacherComment" TEXT;
ALTER TABLE "Submission" ADD COLUMN "gradedById" TEXT;
ALTER TABLE "Submission" ADD COLUMN "gradedAt" TIMESTAMP(3);
ALTER TABLE "Submission" ALTER COLUMN "code" SET DEFAULT '';

-- AlterTable DiscussionPost
ALTER TABLE "DiscussionPost" ADD COLUMN "labSetId" TEXT;
ALTER TABLE "DiscussionPost" ADD COLUMN "pinned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DiscussionPost" ADD COLUMN "resolved" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DiscussionPost" ADD COLUMN "anonymous" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DiscussionPost" ADD COLUMN "viewCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DiscussionPost" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable DiscussionComment
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

-- CreateTable DiscussionAttachment
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
CREATE INDEX "DiscussionComment_postId_idx" ON "DiscussionComment"("postId");
CREATE INDEX "DiscussionComment_parentId_idx" ON "DiscussionComment"("parentId");
CREATE INDEX "DiscussionAttachment_postId_idx" ON "DiscussionAttachment"("postId");
CREATE INDEX "DiscussionAttachment_commentId_idx" ON "DiscussionAttachment"("commentId");
CREATE INDEX "DiscussionPost_labSetId_idx" ON "DiscussionPost"("labSetId");

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_gradedById_fkey" FOREIGN KEY ("gradedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DiscussionPost" ADD CONSTRAINT "DiscussionPost_labSetId_fkey" FOREIGN KEY ("labSetId") REFERENCES "LabSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiscussionComment" ADD CONSTRAINT "DiscussionComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "DiscussionPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiscussionComment" ADD CONSTRAINT "DiscussionComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiscussionComment" ADD CONSTRAINT "DiscussionComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "DiscussionComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiscussionAttachment" ADD CONSTRAINT "DiscussionAttachment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "DiscussionPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiscussionAttachment" ADD CONSTRAINT "DiscussionAttachment_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "DiscussionComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiscussionAttachment" ADD CONSTRAINT "DiscussionAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
