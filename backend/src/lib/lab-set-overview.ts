import { prisma } from "./prisma.js";
import { computeLabSetSetAverage } from "./lab-grades.js";
import {
  STUDENT_GROUP_LABEL,
  STUDENT_GROUP_ORDER,
  TEACHER_GROUP_LABEL,
  TEACHER_GROUP_ORDER,
  computeLabSetAccess,
  countAcceptedLabsInSet,
  countFullySolvedStudents,
  getLabSetSortDueMs,
  isLabSetCompleted,
  serializeLabSetTimes,
  toLabSetTimeRow,
  type LabSetAccessDto,
  type LabSetTimeRow,
  type StudentLabSetStatus,
  type TeacherLabSetStatus,
} from "./lab-set-status.js";

export type LabSetOverviewProgress = {
  done: number;
  total: number;
};

export type LabSetOverviewCompletion = {
  solved: number;
  enrolled: number;
};

export type StudentLabSetOverviewCard = {
  id: string;
  courseId: string;
  courseTitle: string;
  title: string;
  description: string | null;
  sortOrder: number;
  problemCount: number;
  startAt: string | null;
  dueAt: string | null;
  allowMakeup: boolean;
  makeupDueAt: string | null;
  outsideAccessMode: "BLOCK" | "VIEW_ONLY";
  access: LabSetAccessDto;
  progress: LabSetOverviewProgress;
  completed: boolean;
  score: number | null;
};

export type TeacherLabSetOverviewCard = Omit<
  StudentLabSetOverviewCard,
  "progress" | "completed" | "score"
> & {
  completion: LabSetOverviewCompletion;
};

export type LabSetOverviewGroup<T> = {
  status: string;
  label: string;
  items: T[];
};

type LabSetRow = {
  id: string;
  courseId: string;
  title: string;
  description: string | null;
  sortOrder: number;
  startAt: Date | null;
  dueAt: Date | null;
  allowMakeup: boolean;
  makeupDueAt: Date | null;
  outsideAccessMode: string;
  createdAt: Date;
  labs: Array<{ id: string }>;
};

type CourseBundle = {
  id: string;
  title: string;
  labSets: LabSetRow[];
};

const labSetOverviewInclude = {
  orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }],
  select: {
    id: true,
    courseId: true,
    title: true,
    description: true,
    sortOrder: true,
    startAt: true,
    dueAt: true,
    allowMakeup: true,
    makeupDueAt: true,
    outsideAccessMode: true,
    createdAt: true,
    labs: { select: { id: true } },
  },
};

function compareSortDue(a: LabSetTimeRow, b: LabSetTimeRow): number {
  const da = getLabSetSortDueMs(a);
  const db = getLabSetSortDueMs(b);
  if (da == null && db == null) return 0;
  if (da == null) return 1;
  if (db == null) return -1;
  return da - db;
}

function timeRowFromIsoFields(c: {
  startAt: string | null;
  dueAt: string | null;
  allowMakeup?: boolean;
  makeupDueAt?: string | null;
  outsideAccessMode?: string;
}): LabSetTimeRow {
  return toLabSetTimeRow({
    startAt: c.startAt ? new Date(c.startAt) : null,
    dueAt: c.dueAt ? new Date(c.dueAt) : null,
    allowMakeup: c.allowMakeup ?? false,
    makeupDueAt: c.makeupDueAt ? new Date(c.makeupDueAt) : null,
    outsideAccessMode: c.outsideAccessMode ?? "BLOCK",
    createdAt: new Date(0),
  });
}

function buildStudentCard(
  set: LabSetRow,
  courseTitle: string,
  userId: string,
  submissions: Array<{
    labId: string;
    userId: string;
    status: string;
    score: number | null;
  }>,
  nowMs: number,
): StudentLabSetOverviewCard {
  const timeRow = toLabSetTimeRow(set);
  const labIds = set.labs.map((l) => l.id);
  const total = labIds.length;
  const completed = isLabSetCompleted(labIds, submissions, userId);
  const done = countAcceptedLabsInSet(labIds, submissions, userId);
  const access = computeLabSetAccess({
    row: timeRow,
    isTeacher: false,
    nowMs,
    labSetCompleted: completed,
  });

  return {
    id: set.id,
    courseId: set.courseId,
    courseTitle,
    title: set.title,
    description: set.description,
    sortOrder: set.sortOrder,
    problemCount: total,
    ...serializeLabSetTimes(set),
    access,
    progress: { done, total },
    completed,
    score: computeLabSetSetAverage(labIds, submissions, userId),
  };
}

function buildTeacherCard(
  set: LabSetRow,
  courseTitle: string,
  submissions: Array<{ labId: string; userId: string; status: string }>,
  enrolledIds: string[],
  nowMs: number,
): TeacherLabSetOverviewCard {
  const timeRow = toLabSetTimeRow(set);
  const labIds = set.labs.map((l) => l.id);
  const access = computeLabSetAccess({
    row: timeRow,
    isTeacher: true,
    nowMs,
  });

  return {
    id: set.id,
    courseId: set.courseId,
    courseTitle,
    title: set.title,
    description: set.description,
    sortOrder: set.sortOrder,
    problemCount: labIds.length,
    ...serializeLabSetTimes(set),
    access,
    completion: {
      solved: countFullySolvedStudents(labIds, submissions, enrolledIds),
      enrolled: enrolledIds.length,
    },
  };
}

function groupStudentCards(cards: StudentLabSetOverviewCard[]): LabSetOverviewGroup<StudentLabSetOverviewCard>[] {
  const buckets = new Map<StudentLabSetStatus, StudentLabSetOverviewCard[]>();
  for (const c of cards) {
    const key = c.access.studentStatus;
    const list = buckets.get(key) ?? [];
    list.push(c);
    buckets.set(key, list);
  }

  return STUDENT_GROUP_ORDER.filter((k) => (buckets.get(k)?.length ?? 0) > 0).map((status) => {
    const items = [...(buckets.get(status) ?? [])].sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return compareSortDue(timeRowFromIsoFields(a), timeRowFromIsoFields(b));
    });
    return { status, label: STUDENT_GROUP_LABEL[status], items };
  });
}

function groupTeacherCards(cards: TeacherLabSetOverviewCard[]): LabSetOverviewGroup<TeacherLabSetOverviewCard>[] {
  const buckets = new Map<TeacherLabSetStatus, TeacherLabSetOverviewCard[]>();
  for (const c of cards) {
    const key = c.access.teacherStatus;
    const list = buckets.get(key) ?? [];
    list.push(c);
    buckets.set(key, list);
  }

  return TEACHER_GROUP_ORDER.filter((k) => (buckets.get(k)?.length ?? 0) > 0).map((status) => {
    const items = [...(buckets.get(status) ?? [])].sort((a, b) =>
      compareSortDue(timeRowFromIsoFields(a), timeRowFromIsoFields(b)),
    );
    return { status, label: TEACHER_GROUP_LABEL[status], items };
  });
}

async function loadCoursesForStudent(userId: string, courseIdFilter?: string): Promise<CourseBundle[]> {
  const enrollments = await prisma.enrollment.findMany({
    where: {
      userId,
      ...(courseIdFilter ? { courseId: courseIdFilter } : {}),
    },
    include: {
      course: {
        select: {
          id: true,
          title: true,
          labSets: labSetOverviewInclude,
        },
      },
    },
  });
  return enrollments.map((e) => ({
    id: e.course.id,
    title: e.course.title,
    labSets: e.course.labSets as LabSetRow[],
  }));
}

async function loadCoursesForTeacher(
  userId: string,
  role: string,
  courseIdFilter?: string,
): Promise<CourseBundle[]> {
  const courses = await prisma.course.findMany({
    where: {
      ...(role === "ADMIN" ? {} : { teacherId: userId }),
      ...(courseIdFilter ? { id: courseIdFilter } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      labSets: labSetOverviewInclude,
    },
  });
  return courses.map((c) => ({
    id: c.id,
    title: c.title,
    labSets: c.labSets as LabSetRow[],
  }));
}

async function loadSubmissionsForLabIds(
  labIds: string[],
): Promise<Array<{ labId: string; userId: string; status: string; score: number | null }>> {
  if (labIds.length === 0) return [];
  return prisma.submission.findMany({
    where: { labId: { in: labIds } },
    select: { labId: true, userId: true, status: true, score: true },
  });
}

async function loadEnrollmentCounts(courseIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (courseIds.length === 0) return map;
  const rows = await prisma.enrollment.findMany({
    where: { courseId: { in: courseIds } },
    select: { courseId: true, userId: true },
  });
  for (const r of rows) {
    const list = map.get(r.courseId) ?? [];
    list.push(r.userId);
    map.set(r.courseId, list);
  }
  return map;
}

export async function buildStudentLabSetOverview(opts: {
  userId: string;
  courseId?: string;
  nowMs?: number;
}): Promise<{ groups: LabSetOverviewGroup<StudentLabSetOverviewCard>[]; total: number }> {
  const nowMs = opts.nowMs ?? Date.now();
  const courses = await loadCoursesForStudent(opts.userId, opts.courseId);
  const allLabIds = courses.flatMap((c) => c.labSets.flatMap((s) => s.labs.map((l) => l.id)));
  const submissions = await loadSubmissionsForLabIds(allLabIds);

  const cards: StudentLabSetOverviewCard[] = [];
  for (const course of courses) {
    for (const set of course.labSets) {
      cards.push(buildStudentCard(set, course.title, opts.userId, submissions, nowMs));
    }
  }

  const groups = groupStudentCards(cards);
  return { groups, total: cards.length };
}

export async function buildTeacherLabSetOverview(opts: {
  userId: string;
  role: string;
  courseId?: string;
  nowMs?: number;
}): Promise<{ groups: LabSetOverviewGroup<TeacherLabSetOverviewCard>[]; total: number }> {
  const nowMs = opts.nowMs ?? Date.now();
  const courses = await loadCoursesForTeacher(opts.userId, opts.role, opts.courseId);
  const courseIds = courses.map((c) => c.id);
  const enrollmentByCourse = await loadEnrollmentCounts(courseIds);
  const allLabIds = courses.flatMap((c) => c.labSets.flatMap((s) => s.labs.map((l) => l.id)));
  const submissions = await loadSubmissionsForLabIds(allLabIds);

  const cards: TeacherLabSetOverviewCard[] = [];
  for (const course of courses) {
    const enrolledIds = enrollmentByCourse.get(course.id) ?? [];
    for (const set of course.labSets) {
      cards.push(buildTeacherCard(set, course.title, submissions, enrolledIds, nowMs));
    }
  }

  const groups = groupTeacherCards(cards);
  return { groups, total: cards.length };
}
