-- CreateEnum
CREATE TYPE "CourseNature" AS ENUM ('REQUIRED', 'ELECTIVE');
CREATE TYPE "SubjectCategory" AS ENUM ('MATH', 'ENGLISH', 'CS', 'IDEOLOGY', 'PE', 'GENERAL');
CREATE TYPE "EnrollmentPhase" AS ENUM ('PRESELECT', 'FORMAL', 'ADD_DROP', 'CLOSED');
CREATE TYPE "EnrollmentLogAction" AS ENUM ('ENROLL', 'DROP', 'WAITLIST_JOIN', 'WAITLIST_LEAVE', 'WAITLIST_PROMOTED', 'ADMIN_ENROLL', 'ADMIN_DROP', 'TIMETABLE_CONFIRM');

-- AlterTable Course
ALTER TABLE "Course" ADD COLUMN "courseCode" TEXT;
ALTER TABLE "Course" ADD COLUMN "credits" INTEGER NOT NULL DEFAULT 2;
ALTER TABLE "Course" ADD COLUMN "capacity" INTEGER NOT NULL DEFAULT 60;
ALTER TABLE "Course" ADD COLUMN "courseNature" "CourseNature" NOT NULL DEFAULT 'ELECTIVE';
ALTER TABLE "Course" ADD COLUMN "subjectCategory" "SubjectCategory" NOT NULL DEFAULT 'CS';
ALTER TABLE "Course" ADD COLUMN "semesterKey" TEXT NOT NULL DEFAULT '2026-spring';

CREATE UNIQUE INDEX "Course_courseCode_key" ON "Course"("courseCode");

-- CreateTable
CREATE TABLE "EnrollmentWaitlist" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notifiedAt" TIMESTAMP(3),

    CONSTRAINT "EnrollmentWaitlist_pkey" PRIMARY KEY ("id")
);

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

CREATE TABLE "TimetableConfirmation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "semesterKey" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimetableConfirmation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EnrollmentWaitlist_userId_courseId_key" ON "EnrollmentWaitlist"("userId", "courseId");
CREATE INDEX "EnrollmentWaitlist_courseId_createdAt_idx" ON "EnrollmentWaitlist"("courseId", "createdAt");
CREATE INDEX "EnrollmentLog_userId_createdAt_idx" ON "EnrollmentLog"("userId", "createdAt");
CREATE INDEX "EnrollmentLog_courseId_createdAt_idx" ON "EnrollmentLog"("courseId", "createdAt");
CREATE UNIQUE INDEX "EnrollmentPeriod_semesterKey_key" ON "EnrollmentPeriod"("semesterKey");
CREATE UNIQUE INDEX "TimetableConfirmation_userId_semesterKey_key" ON "TimetableConfirmation"("userId", "semesterKey");

ALTER TABLE "EnrollmentWaitlist" ADD CONSTRAINT "EnrollmentWaitlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnrollmentWaitlist" ADD CONSTRAINT "EnrollmentWaitlist_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnrollmentLog" ADD CONSTRAINT "EnrollmentLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnrollmentLog" ADD CONSTRAINT "EnrollmentLog_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnrollmentLog" ADD CONSTRAINT "EnrollmentLog_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TimetableConfirmation" ADD CONSTRAINT "TimetableConfirmation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
