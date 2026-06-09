export type CourseSectionRow = {
  sectionId: string;
  sectionLabel: string;
  teacherName: string;
  courseNatureLabel: string;
  subjectCategoryLabel: string;
  department: string;
  scheduleDetail: string;
  capacity: number;
  enrolledCount: number;
  isFull: boolean;
  isSelected: boolean;
  scheduleConflict: boolean;
};

export type CatalogCourse = {
  id: string;
  title: string;
  courseCode: string | null;
  credits: number;
  capacity: number;
  enrolledCount: number;
  waitlistCount: number;
  isFull: boolean;
  courseNature: string;
  courseNatureLabel: string;
  subjectCategory: string;
  subjectCategoryLabel: string;
  offeringCollegeCode: string | null;
  offeringCollegeLabel: string;
  category: string | null;
  teacher: { id: string; name: string };
  scheduleSummary: string;
  isEnrolled: boolean;
  isWaitlisted: boolean;
  waitlistPosition: number | null;
  selectedSectionCount: number;
  scheduleConflict: boolean;
  sections: CourseSectionRow[];
  recommendReason?: string;
  classmatePickCount?: number;
};

export type EnrollWindow = {
  open: boolean;
  phaseLabel: string;
  message: string;
  semesterLabel: string;
  openAt: string | null;
  closeAt: string | null;
};

export type ClassRecommendation = {
  classId: string | null;
  className: string;
  peerCount: number;
  message: string;
  courses: CatalogCourse[];
};
