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

-- CreateIndex
CREATE INDEX "LabFile_labId_idx" ON "LabFile"("labId");

-- AddForeignKey
ALTER TABLE "LabFile" ADD CONSTRAINT "LabFile_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Lab"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LabFile" ADD CONSTRAINT "LabFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

