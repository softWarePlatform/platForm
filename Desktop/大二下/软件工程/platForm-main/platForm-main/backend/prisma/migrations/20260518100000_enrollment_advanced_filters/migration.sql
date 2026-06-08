-- CourseNature: add 任修
ALTER TYPE "CourseNature" ADD VALUE IF NOT EXISTS 'RENXIU';

-- SubjectCategory: migrate to new taxonomy
CREATE TYPE "SubjectCategory_new" AS ENUM (
  'MATH_BASIC',
  'ENGINEERING_BASIC',
  'FOREIGN_LANGUAGE',
  'PE',
  'QUALITY_EDU_THEORY',
  'QUALITY_EDU_PRACTICE',
  'CORE_MAJOR',
  'IDEOLOGY',
  'GENERAL_MAJOR',
  'CORE_GENERAL'
);

ALTER TABLE "Course" ALTER COLUMN "subjectCategory" DROP DEFAULT;
ALTER TABLE "Course" ALTER COLUMN "subjectCategory" TYPE "SubjectCategory_new" USING (
  CASE "subjectCategory"::text
    WHEN 'MATH' THEN 'MATH_BASIC'::"SubjectCategory_new"
    WHEN 'ENGLISH' THEN 'FOREIGN_LANGUAGE'::"SubjectCategory_new"
    WHEN 'CS' THEN 'CORE_MAJOR'::"SubjectCategory_new"
    WHEN 'IDEOLOGY' THEN 'IDEOLOGY'::"SubjectCategory_new"
    WHEN 'PE' THEN 'PE'::"SubjectCategory_new"
    WHEN 'GENERAL' THEN 'CORE_GENERAL'::"SubjectCategory_new"
    ELSE 'GENERAL_MAJOR'::"SubjectCategory_new"
  END
);

DROP TYPE "SubjectCategory";
ALTER TYPE "SubjectCategory_new" RENAME TO "SubjectCategory";
ALTER TABLE "Course" ALTER COLUMN "subjectCategory" SET DEFAULT 'GENERAL_MAJOR'::"SubjectCategory";

ALTER TABLE "Course" ADD COLUMN IF NOT EXISTS "offeringCollegeCode" TEXT;
