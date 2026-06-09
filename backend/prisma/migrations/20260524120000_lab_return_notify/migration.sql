-- 实验打回与通知相关字段
ALTER TABLE "LabSet" ADD COLUMN "maxReturnCount" INTEGER;

ALTER TABLE "Submission" ADD COLUMN "returnReason" TEXT;
ALTER TABLE "Submission" ADD COLUMN "returnCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Submission" ADD COLUMN "returnedAt" TIMESTAMP(3);
