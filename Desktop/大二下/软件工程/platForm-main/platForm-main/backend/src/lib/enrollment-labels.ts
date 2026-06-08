import type { CourseNature, EnrollmentPhase, SubjectCategory } from "@prisma/client";
import type { ScheduleSlot } from "./scheduleSlots.js";
import { OFFERING_COLLEGE_LABELS, OFFERING_COLLEGES } from "./enrollment-filters.js";

const DAY_NAMES = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];

export const SUBJECT_CATEGORY_LABELS: Record<SubjectCategory, string> = {
  MATH_BASIC: "数理基础课",
  ENGINEERING_BASIC: "工程基础课",
  FOREIGN_LANGUAGE: "外语类课",
  PE: "体育课",
  QUALITY_EDU_THEORY: "素质教育理论课",
  QUALITY_EDU_PRACTICE: "素质教育实践课",
  CORE_MAJOR: "核心专业类",
  IDEOLOGY: "思政课",
  GENERAL_MAJOR: "一般专业类",
  CORE_GENERAL: "核心通识类",
};

export const COURSE_NATURE_LABELS: Record<CourseNature, string> = {
  REQUIRED: "必修",
  RENXIU: "任修",
  ELECTIVE: "选修",
};

export const ENROLLMENT_PHASE_LABELS: Record<EnrollmentPhase, string> = {
  PRESELECT: "预选课",
  FORMAL: "正选",
  ADD_DROP: "补退选",
  CLOSED: "已关闭",
};

export function getEnrollmentFilterOptions() {
  return {
    courseNatures: COURSE_NATURE_LABELS,
    subjectCategories: SUBJECT_CATEGORY_LABELS,
    offeringColleges: OFFERING_COLLEGE_LABELS,
    offeringCollegeList: OFFERING_COLLEGES,
  };
}

export function formatScheduleSummary(slots: ScheduleSlot[]): string {
  if (!slots.length) return "时间待定";
  return slots
    .map((s) => {
      const day = DAY_NAMES[s.dayOfWeek] ?? `周${s.dayOfWeek}`;
      const room = s.room ? ` ${s.room}` : "";
      return `${day} 第${s.periodStart}-${s.periodEnd}节${room}`;
    })
    .join("；");
}

/** 教务系统风格：周次/星期/节次/教师/教室 */
export function formatScheduleDetail(
  slots: ScheduleSlot[],
  teacherName: string,
  weeks = "1-16周[理论]",
): string {
  if (!slots.length) return "时间待定";
  return slots
    .map((s) => {
      const day = DAY_NAMES[s.dayOfWeek] ?? `周${s.dayOfWeek}`;
      const room = s.room || "教室待定";
      return `${weeks}/${day}/第${s.periodStart}节-第${s.periodEnd}节/${teacherName}[主讲]/${room}`;
    })
    .join("；");
}
