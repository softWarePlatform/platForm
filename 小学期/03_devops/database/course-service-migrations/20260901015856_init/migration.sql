-- CreateEnum
CREATE TYPE "Role" AS ENUM ('STUDENT', 'TEACHER', 'ADMIN');

-- CreateEnum
CREATE TYPE "CourseNature" AS ENUM ('REQUIRED', 'RENXIU', 'ELECTIVE');

-- CreateEnum
CREATE TYPE "SubjectCategory" AS ENUM ('MATH_BASIC', 'ENGINEERING_BASIC', 'FOREIGN_LANGUAGE', 'PE', 'QUALITY_EDU_THEORY', 'QUALITY_EDU_PRACTICE', 'CORE_MAJOR', 'IDEOLOGY', 'GENERAL_MAJOR', 'CORE_GENERAL');

-- CreateEnum
CREATE TYPE "EnrollmentPhase" AS ENUM ('PRESELECT', 'FORMAL', 'ADD_DROP', 'CLOSED');

-- CreateEnum
CREATE TYPE "EnrollmentLogAction" AS ENUM ('ENROLL', 'DROP', 'WAITLIST_JOIN', 'WAITLIST_LEAVE', 'WAITLIST_PROMOTED', 'ADMIN_ENROLL', 'ADMIN_DROP', 'ADMIN_DELETE_USER', 'TIMETABLE_CONFIRM', 'COURSE_CREATE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'STUDENT',
    "avatarUrl" TEXT,
    "signature" TEXT,
    "emailVerifiedAt" TIMESTAMP(3),
    "emailVerifyToken" TEXT,
    "emailVerifyExpiresAt" TIMESTAMP(3),
    "passwordResetToken" TEXT,
    "passwordResetExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "teacherId" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "knowledgeGraphJson" TEXT,
    "scheduleSlotsJson" TEXT,
    "courseCode" TEXT,
    "credits" INTEGER NOT NULL DEFAULT 2,
    "capacity" INTEGER NOT NULL DEFAULT 60,
    "courseNature" "CourseNature" NOT NULL DEFAULT 'ELECTIVE',
    "subjectCategory" "SubjectCategory" NOT NULL DEFAULT 'GENERAL_MAJOR',
    "offeringCollegeCode" TEXT,
    "semesterKey" TEXT NOT NULL DEFAULT '2026-spring',

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Class" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,

    CONSTRAINT "Class_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enrollment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "classId" TEXT,

    CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnrollmentWaitlist" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notifiedAt" TIMESTAMP(3),

    CONSTRAINT "EnrollmentWaitlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnrollmentLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "action" "EnrollmentLogAction" NOT NULL,
    "operatorId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnrollmentLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnrollmentPeriod" (
    "id" TEXT NOT NULL,
    "semesterKey" TEXT NOT NULL,
    "label" TEXT,
    "phase" "EnrollmentPhase" NOT NULL DEFAULT 'FORMAL',
    "openAt" TIMESTAMP(3) NOT NULL,
    "closeAt" TIMESTAMP(3) NOT NULL,
    "confirmDeadline" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnrollmentPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimetableConfirmation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "semesterKey" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimetableConfirmation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseAnnouncement" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "editHistoryJson" TEXT,

    CONSTRAINT "CourseAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnouncementMark" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnouncementMark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnouncementRead" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnouncementRead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseMaterial" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storedPath" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "folderPath" TEXT NOT NULL DEFAULT '',
    "visibility" TEXT NOT NULL DEFAULT 'ALL',
    "targetClassId" TEXT,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "groupId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "lastDownloadAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialFavorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'ANNOUNCEMENT',
    "title" TEXT NOT NULL,
    "body" TEXT,
    "linkPath" TEXT,
    "announcementId" TEXT,
    "materialId" TEXT,
    "homeworkId" TEXT,
    "labSetId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Course_courseCode_key" ON "Course"("courseCode");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_userId_courseId_key" ON "Enrollment"("userId", "courseId");

-- CreateIndex
CREATE INDEX "EnrollmentWaitlist_courseId_createdAt_idx" ON "EnrollmentWaitlist"("courseId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EnrollmentWaitlist_userId_courseId_key" ON "EnrollmentWaitlist"("userId", "courseId");

-- CreateIndex
CREATE INDEX "EnrollmentLog_userId_createdAt_idx" ON "EnrollmentLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "EnrollmentLog_courseId_createdAt_idx" ON "EnrollmentLog"("courseId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EnrollmentPeriod_semesterKey_key" ON "EnrollmentPeriod"("semesterKey");

-- CreateIndex
CREATE UNIQUE INDEX "TimetableConfirmation_userId_semesterKey_key" ON "TimetableConfirmation"("userId", "semesterKey");

-- CreateIndex
CREATE INDEX "CourseAnnouncement_courseId_idx" ON "CourseAnnouncement"("courseId");

-- CreateIndex
CREATE INDEX "CourseAnnouncement_courseId_pinned_createdAt_idx" ON "CourseAnnouncement"("courseId", "pinned", "createdAt");

-- CreateIndex
CREATE INDEX "AnnouncementMark_userId_idx" ON "AnnouncementMark"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AnnouncementMark_announcementId_userId_key" ON "AnnouncementMark"("announcementId", "userId");

-- CreateIndex
CREATE INDEX "AnnouncementRead_userId_idx" ON "AnnouncementRead"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AnnouncementRead_announcementId_userId_key" ON "AnnouncementRead"("announcementId", "userId");

-- CreateIndex
CREATE INDEX "CourseMaterial_courseId_isCurrent_idx" ON "CourseMaterial"("courseId", "isCurrent");

-- CreateIndex
CREATE INDEX "CourseMaterial_courseId_folderPath_idx" ON "CourseMaterial"("courseId", "folderPath");

-- CreateIndex
CREATE INDEX "CourseMaterial_courseId_pinned_createdAt_idx" ON "CourseMaterial"("courseId", "pinned", "createdAt");

-- CreateIndex
CREATE INDEX "CourseMaterial_groupId_idx" ON "CourseMaterial"("groupId");

-- CreateIndex
CREATE INDEX "MaterialFavorite_userId_idx" ON "MaterialFavorite"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialFavorite_userId_materialId_key" ON "MaterialFavorite"("userId", "materialId");

-- CreateIndex
CREATE INDEX "SiteNotification_userId_readAt_idx" ON "SiteNotification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "SiteNotification_userId_createdAt_idx" ON "SiteNotification"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Class" ADD CONSTRAINT "Class_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrollmentWaitlist" ADD CONSTRAINT "EnrollmentWaitlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrollmentWaitlist" ADD CONSTRAINT "EnrollmentWaitlist_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrollmentLog" ADD CONSTRAINT "EnrollmentLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrollmentLog" ADD CONSTRAINT "EnrollmentLog_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrollmentLog" ADD CONSTRAINT "EnrollmentLog_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableConfirmation" ADD CONSTRAINT "TimetableConfirmation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseAnnouncement" ADD CONSTRAINT "CourseAnnouncement_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseAnnouncement" ADD CONSTRAINT "CourseAnnouncement_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementMark" ADD CONSTRAINT "AnnouncementMark_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "CourseAnnouncement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementMark" ADD CONSTRAINT "AnnouncementMark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementRead" ADD CONSTRAINT "AnnouncementRead_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "CourseAnnouncement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementRead" ADD CONSTRAINT "AnnouncementRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseMaterial" ADD CONSTRAINT "CourseMaterial_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseMaterial" ADD CONSTRAINT "CourseMaterial_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseMaterial" ADD CONSTRAINT "CourseMaterial_targetClassId_fkey" FOREIGN KEY ("targetClassId") REFERENCES "Class"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialFavorite" ADD CONSTRAINT "MaterialFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialFavorite" ADD CONSTRAINT "MaterialFavorite_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "CourseMaterial"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteNotification" ADD CONSTRAINT "SiteNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
