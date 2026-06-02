-- AlterTable CourseMaterial
ALTER TABLE "CourseMaterial" ADD COLUMN "folderPath" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CourseMaterial" ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'ALL';
ALTER TABLE "CourseMaterial" ADD COLUMN "targetClassId" TEXT;
ALTER TABLE "CourseMaterial" ADD COLUMN "pinned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CourseMaterial" ADD COLUMN "groupId" TEXT;
ALTER TABLE "CourseMaterial" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "CourseMaterial" ADD COLUMN "isCurrent" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CourseMaterial" ADD COLUMN "downloadCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CourseMaterial" ADD COLUMN "lastDownloadAt" TIMESTAMP(3);
ALTER TABLE "CourseMaterial" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "CourseMaterial" SET "groupId" = "id" WHERE "groupId" IS NULL;
ALTER TABLE "CourseMaterial" ALTER COLUMN "groupId" SET NOT NULL;

-- CreateTable MaterialFavorite
CREATE TABLE "MaterialFavorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialFavorite_pkey" PRIMARY KEY ("id")
);

-- AlterTable SiteNotification
ALTER TABLE "SiteNotification" ADD COLUMN "materialId" TEXT;

-- CreateIndex
CREATE INDEX "CourseMaterial_courseId_isCurrent_idx" ON "CourseMaterial"("courseId", "isCurrent");
CREATE INDEX "CourseMaterial_courseId_folderPath_idx" ON "CourseMaterial"("courseId", "folderPath");
CREATE INDEX "CourseMaterial_courseId_pinned_createdAt_idx" ON "CourseMaterial"("courseId", "pinned", "createdAt");
CREATE INDEX "CourseMaterial_groupId_idx" ON "CourseMaterial"("groupId");
CREATE UNIQUE INDEX "MaterialFavorite_userId_materialId_key" ON "MaterialFavorite"("userId", "materialId");
CREATE INDEX "MaterialFavorite_userId_idx" ON "MaterialFavorite"("userId");

-- AddForeignKey
ALTER TABLE "CourseMaterial" ADD CONSTRAINT "CourseMaterial_targetClassId_fkey" FOREIGN KEY ("targetClassId") REFERENCES "Class"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MaterialFavorite" ADD CONSTRAINT "MaterialFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaterialFavorite" ADD CONSTRAINT "MaterialFavorite_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "CourseMaterial"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SiteNotification" ADD CONSTRAINT "SiteNotification_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "CourseMaterial"("id") ON DELETE SET NULL ON UPDATE CASCADE;
