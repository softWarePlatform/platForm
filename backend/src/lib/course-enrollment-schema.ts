import { z } from "zod";

export const courseNatureValues = ["REQUIRED", "RENXIU", "ELECTIVE"] as const;

export const subjectCategoryValues = [
  "MATH_BASIC",
  "ENGINEERING_BASIC",
  "FOREIGN_LANGUAGE",
  "PE",
  "QUALITY_EDU_THEORY",
  "QUALITY_EDU_PRACTICE",
  "CORE_MAJOR",
  "IDEOLOGY",
  "GENERAL_MAJOR",
  "CORE_GENERAL",
] as const;

export const courseEnrollmentFieldsSchema = z.object({
  courseCode: z.string().trim().min(1).max(32).nullable().optional(),
  credits: z.number().int().min(1).max(20).optional(),
  capacity: z.number().int().min(1).max(9999).optional(),
  courseNature: z.enum(courseNatureValues).optional(),
  subjectCategory: z.enum(subjectCategoryValues).optional(),
  offeringCollegeCode: z.string().trim().max(8).nullable().optional(),
  semesterKey: z.string().trim().min(1).max(32).optional(),
});

export type CourseEnrollmentFieldsInput = z.infer<typeof courseEnrollmentFieldsSchema>;
