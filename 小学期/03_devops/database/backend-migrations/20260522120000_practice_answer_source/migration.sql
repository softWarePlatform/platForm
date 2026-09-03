-- CreateEnum
CREATE TYPE "PracticeAnswerSource" AS ENUM ('TEACHER', 'AI');

-- AlterTable
ALTER TABLE "PracticeQuestion" ADD COLUMN "answerSource" "PracticeAnswerSource" NOT NULL DEFAULT 'TEACHER';
ALTER TABLE "PracticeQuestion" ADD COLUMN "answerConfirmed" BOOLEAN NOT NULL DEFAULT true;
