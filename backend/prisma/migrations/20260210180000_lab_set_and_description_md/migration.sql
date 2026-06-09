-- CreateTable
CREATE TABLE "LabSet" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabSet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LabSet_courseId_idx" ON "LabSet"("courseId");

-- AddForeignKey
ALTER TABLE "LabSet" ADD CONSTRAINT "LabSet_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Lab" ADD COLUMN     "labSetId" TEXT,
ADD COLUMN     "descriptionMd" TEXT;

-- 为已有课程各建一个默认实验集，并把该课下所有 Lab 挂到该集下
WITH needed AS (
    SELECT DISTINCT "courseId" FROM "Lab"
),
inserted AS (
    INSERT INTO "LabSet" ("id", "courseId", "title", "description", "dueAt", "sortOrder", "createdAt")
    SELECT gen_random_uuid()::text, n."courseId", '综合实验（迁移生成）', NULL, NULL, 0, CURRENT_TIMESTAMP
    FROM needed n
    RETURNING "id", "courseId"
)
UPDATE "Lab" l
SET "labSetId" = i."id"
FROM inserted i
WHERE l."courseId" = i."courseId";

-- AlterTable
ALTER TABLE "Lab" ALTER COLUMN "labSetId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Lab_labSetId_idx" ON "Lab"("labSetId");

-- AddForeignKey
ALTER TABLE "Lab" ADD CONSTRAINT "Lab_labSetId_fkey" FOREIGN KEY ("labSetId") REFERENCES "LabSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
