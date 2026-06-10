import type { EnrollmentLogAction, EnrollmentPeriod, Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import { currentSemester } from "./semester.js";
import { parseScheduleSlotsJson, slotsConflict, type ScheduleSlot } from "./scheduleSlots.js";
import { offeringCollegeLabel } from "./enrollment-filters.js";
import {
  COURSE_NATURE_LABELS,
  formatScheduleDetail,
  formatScheduleSummary,
  SUBJECT_CATEGORY_LABELS,
} from "./enrollment-labels.js";

const DAY_SEARCH_MAP: Record<string, number> = {
  周一: 1,
  周二: 2,
  周三: 3,
  周四: 4,
  周五: 5,
  周六: 6,
  周日: 7,
};

function buildScheduleTimeFilter(term: string): Prisma.CourseWhereInput {
  const t = term.trim();
  for (const [label, day] of Object.entries(DAY_SEARCH_MAP)) {
    if (t.includes(label)) {
      return { scheduleSlotsJson: { contains: `"dayOfWeek":${day}` } };
    }
  }
  const periodMatch = t.match(/第?\s*(\d+)\s*节?/);
  if (periodMatch) {
    const p = periodMatch[1];
    return {
      OR: [
        { scheduleSlotsJson: { contains: `"periodStart":${p}` } },
        { scheduleSlotsJson: { contains: `"periodEnd":${p}` } },
      ],
    };
  }
  return { scheduleSlotsJson: { contains: t, mode: "insensitive" } };
}

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

export type EnrollmentWindowStatus = {
  open: boolean;
  phase: string;
  phaseLabel: string;
  message: string;
  semesterKey: string;
  semesterLabel: string;
  openAt: string | null;
  closeAt: string | null;
  confirmDeadline: string | null;
};

export function evaluateEnrollmentWindow(period: EnrollmentPeriod | null): EnrollmentWindowStatus {
  const sem = currentSemester();
  if (!period) {
    return {
      open: true,
      phase: "FORMAL",
      phaseLabel: "正选",
      message: "未配置选课时段，演示环境默认开放选课",
      semesterKey: sem.key,
      semesterLabel: sem.label,
      openAt: null,
      closeAt: null,
      confirmDeadline: null,
    };
  }

  const now = new Date();
  const base = {
    semesterKey: period.semesterKey,
    semesterLabel: period.label ?? sem.label,
    openAt: period.openAt.toISOString(),
    closeAt: period.closeAt.toISOString(),
    confirmDeadline: period.confirmDeadline?.toISOString() ?? null,
    phase: period.phase,
    phaseLabel:
      period.phase === "PRESELECT"
        ? "预选课"
        : period.phase === "FORMAL"
          ? "正选"
          : period.phase === "ADD_DROP"
            ? "补退选"
            : "已关闭",
  };

  if (period.phase === "CLOSED") {
    return { ...base, open: false, message: "选课阶段已关闭" };
  }
  if (now < period.openAt) {
    return { ...base, open: false, message: `选课尚未开始（${period.openAt.toLocaleString("zh-CN")} 起）` };
  }
  if (now > period.closeAt) {
    return { ...base, open: false, message: `选课已结束（截止 ${period.closeAt.toLocaleString("zh-CN")}）` };
  }
  return { ...base, open: true, message: `${base.phaseLabel}进行中，欢迎选课` };
}

export async function getEnrollmentPeriodForCurrentSemester() {
  const { key } = currentSemester();
  return prisma.enrollmentPeriod.findUnique({ where: { semesterKey: key } });
}

export async function assertEnrollmentOpen() {
  const period = await getEnrollmentPeriodForCurrentSemester();
  const window = evaluateEnrollmentWindow(period);
  if (!window.open) {
    const err = new Error(window.message) as Error & { statusCode: number };
    err.statusCode = 403;
    throw err;
  }
  return window;
}

export async function writeEnrollmentLog(
  userId: string,
  courseId: string,
  action: EnrollmentLogAction,
  operatorId?: string,
  note?: string,
) {
  await prisma.enrollmentLog.create({
    data: { userId, courseId, action, operatorId: operatorId ?? null, note: note ?? null },
  });
}

async function notifyUser(userId: string, title: string, body: string, linkPath: string) {
  await prisma.siteNotification.create({
    data: { userId, type: "ENROLLMENT", title, body, linkPath },
  });
}

export async function promoteWaitlistForCourse(courseId: string) {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) return;

  while (true) {
    const count = await prisma.enrollment.count({ where: { courseId } });
    if (count >= course.capacity) break;

    const next = await prisma.enrollmentWaitlist.findFirst({
      where: { courseId },
      orderBy: { createdAt: "asc" },
    });
    if (!next) break;

    const existing = await prisma.enrollment.findUnique({
      where: { userId_courseId: { userId: next.userId, courseId } },
    });
    if (existing) {
      await prisma.enrollmentWaitlist.delete({ where: { id: next.id } });
      continue;
    }

    await prisma.$transaction([
      prisma.enrollment.create({ data: { userId: next.userId, courseId } }),
      prisma.enrollmentWaitlist.delete({ where: { id: next.id } }),
    ]);
    await writeEnrollmentLog(next.userId, courseId, "WAITLIST_PROMOTED", undefined, "有空位自动入选");
    await notifyUser(
      next.userId,
      "候补入选通知",
      `课程「${course.title}」有空位，系统已为您自动选课。`,
      "/enrollment",
    );
  }
}

export async function enrollStudent(
  userId: string,
  courseId: string,
  opts?: { classId?: string; operatorId?: string; skipWindowCheck?: boolean },
) {
  if (!opts?.skipWindowCheck) await assertEnrollmentOpen();

  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course?.published) {
    const err = new Error("课程不可选") as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }

  const existing = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
  });
  if (existing) {
    const err = new Error("已选过该课程") as Error & { statusCode: number };
    err.statusCode = 409;
    throw err;
  }

  const count = await prisma.enrollment.count({ where: { courseId } });
  if (count >= course.capacity) {
    const err = new Error("课程已满，可加入候补") as Error & { statusCode: number };
    err.statusCode = 409;
    throw err;
  }

  const enrollment = await prisma.enrollment.create({
    data: { userId, courseId, classId: opts?.classId },
  });

  await prisma.enrollmentWaitlist.deleteMany({ where: { userId, courseId } }).catch(() => undefined);

  const action: EnrollmentLogAction = opts?.operatorId ? "ADMIN_ENROLL" : "ENROLL";
  await writeEnrollmentLog(userId, courseId, action, opts?.operatorId);

  return enrollment;
}

export async function dropStudent(
  userId: string,
  courseId: string,
  opts?: { operatorId?: string; skipWindowCheck?: boolean },
) {
  if (!opts?.skipWindowCheck) await assertEnrollmentOpen();

  const row = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
  });
  if (!row) {
    const err = new Error("未选该课程") as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }

  await prisma.enrollment.delete({ where: { id: row.id } });
  const action: EnrollmentLogAction = opts?.operatorId ? "ADMIN_DROP" : "DROP";
  await writeEnrollmentLog(userId, courseId, action, opts?.operatorId);
  await promoteWaitlistForCourse(courseId);
}

export async function joinWaitlist(userId: string, courseId: string) {
  await assertEnrollmentOpen();

  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course?.published) {
    const err = new Error("课程不可选") as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }

  const enrolled = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
  });
  if (enrolled) {
    const err = new Error("已选该课程，无需候补") as Error & { statusCode: number };
    err.statusCode = 409;
    throw err;
  }

  const count = await prisma.enrollment.count({ where: { courseId } });
  if (count < course.capacity) {
    const err = new Error("课程仍有名额，请直接选课") as Error & { statusCode: number };
    err.statusCode = 400;
    throw err;
  }

  try {
    await prisma.enrollmentWaitlist.create({ data: { userId, courseId } });
  } catch {
    const err = new Error("已在候补列表中") as Error & { statusCode: number };
    err.statusCode = 409;
    throw err;
  }
  await writeEnrollmentLog(userId, courseId, "WAITLIST_JOIN");
}

export async function leaveWaitlist(userId: string, courseId: string) {
  await assertEnrollmentOpen();
  const row = await prisma.enrollmentWaitlist.findUnique({
    where: { userId_courseId: { userId, courseId } },
  });
  if (!row) {
    const err = new Error("未在候补列表中") as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }
  await prisma.enrollmentWaitlist.delete({ where: { id: row.id } });
  await writeEnrollmentLog(userId, courseId, "WAITLIST_LEAVE");
}

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
  semesterKey: string;
  teacher: { id: string; name: string };
  scheduleSummary: string;
  scheduleSlots: ScheduleSlot[];
  classNames: string[];
  isEnrolled: boolean;
  isWaitlisted: boolean;
  waitlistPosition: number | null;
  selectedSectionCount: number;
  scheduleConflict: boolean;
  sections: CourseSectionRow[];
  recommendReason?: string;
  classmatePickCount?: number;
};

type CourseListRow = {
  id: string;
  title: string;
  courseCode: string | null;
  credits: number;
  capacity: number;
  courseNature: keyof typeof COURSE_NATURE_LABELS;
  subjectCategory: keyof typeof SUBJECT_CATEGORY_LABELS;
  offeringCollegeCode: string | null;
  category: string | null;
  semesterKey: string;
  scheduleSlotsJson: string | null;
  teacher: { id: string; name: string };
  classes: { id: string; name: string }[];
  _count: { enrollments: number; waitlists: number };
};

function buildSectionsForCourse(
  c: CourseListRow,
  slots: ScheduleSlot[],
  enrolledCount: number,
  myEnrollment: { classId: string | null } | undefined,
  myTimetableSlots: ScheduleSlot[],
): CourseSectionRow[] {
  const natureLabel = COURSE_NATURE_LABELS[c.courseNature];
  const subjectLabel = SUBJECT_CATEGORY_LABELS[c.subjectCategory];
  const department = offeringCollegeLabel(c.offeringCollegeCode) || c.category || "待定开课单位";
  const detail = formatScheduleDetail(slots, c.teacher.name);
  const conflictWithMine = slotsConflict(slots, myTimetableSlots);

  if (c.classes.length === 0) {
    return [
      {
        sectionId: c.id,
        sectionLabel: `[001]${c.teacher.name}`,
        teacherName: c.teacher.name,
        courseNatureLabel: natureLabel,
        subjectCategoryLabel: subjectLabel,
        department,
        scheduleDetail: detail,
        capacity: c.capacity,
        enrolledCount,
        isFull: enrolledCount >= c.capacity,
        isSelected: !!myEnrollment,
        scheduleConflict: conflictWithMine,
      },
    ];
  }

  return c.classes.map((cls, idx) => {
    const code = String(idx + 1).padStart(3, "0");
    return {
      sectionId: cls.id,
      sectionLabel: `[${code}]${c.teacher.name}`,
      teacherName: `${cls.name} / ${c.teacher.name}`,
      courseNatureLabel: natureLabel,
      subjectCategoryLabel: subjectLabel,
      department,
      scheduleDetail: detail,
      capacity: c.capacity,
      enrolledCount,
      isFull: enrolledCount >= c.capacity,
      isSelected: myEnrollment?.classId === cls.id,
      scheduleConflict: conflictWithMine,
    };
  });
}

function mapCourseRow(
  c: CourseListRow,
  ctx: {
    enrolledSet: Set<string>;
    waitMap: Map<string, { createdAt: Date }>;
    waitPositions: Map<string, number>;
    enrollmentByCourse: Map<string, { classId: string | null }>;
    myTimetableSlots: ScheduleSlot[];
    extra?: Pick<CatalogCourse, "recommendReason" | "classmatePickCount">;
  },
): CatalogCourse {
  const slots = parseScheduleSlotsJson(c.scheduleSlotsJson, c.id);
  const enrolledCount = c._count.enrollments;
  const myEnrollment = ctx.enrollmentByCourse.get(c.id);
  const sections = buildSectionsForCourse(c, slots, enrolledCount, myEnrollment, ctx.myTimetableSlots);
  const selectedSectionCount = sections.filter((s) => s.isSelected).length;

  return {
    id: c.id,
    title: c.title,
    courseCode: c.courseCode,
    credits: c.credits,
    capacity: c.capacity,
    enrolledCount,
    waitlistCount: c._count.waitlists,
    isFull: enrolledCount >= c.capacity,
    courseNature: c.courseNature,
    courseNatureLabel: COURSE_NATURE_LABELS[c.courseNature],
    subjectCategory: c.subjectCategory,
    subjectCategoryLabel: SUBJECT_CATEGORY_LABELS[c.subjectCategory],
    offeringCollegeCode: c.offeringCollegeCode,
    offeringCollegeLabel: offeringCollegeLabel(c.offeringCollegeCode),
    category: c.category,
    semesterKey: c.semesterKey,
    teacher: c.teacher,
    scheduleSummary: formatScheduleSummary(slots),
    scheduleSlots: slots,
    classNames: c.classes.map((x) => x.name),
    isEnrolled: ctx.enrolledSet.has(c.id),
    isWaitlisted: ctx.waitMap.has(c.id),
    waitlistPosition: ctx.waitPositions.get(c.id) ?? null,
    selectedSectionCount,
    scheduleConflict: sections.some((s) => s.scheduleConflict) && !ctx.enrolledSet.has(c.id),
    sections,
    ...ctx.extra,
  };
}

async function loadCatalogContext(userId: string, courseIds: string[]) {
  const [myEnrollments, myWaitlists, myAllEnrollments] = await Promise.all([
    prisma.enrollment.findMany({
      where: { userId, courseId: { in: courseIds } },
      select: { courseId: true, classId: true },
    }),
    prisma.enrollmentWaitlist.findMany({
      where: { userId, courseId: { in: courseIds } },
      select: { courseId: true, createdAt: true },
    }),
    prisma.enrollment.findMany({
      where: { userId },
      include: { course: { select: { scheduleSlotsJson: true, id: true } } },
    }),
  ]);

  const enrolledSet = new Set(myEnrollments.map((e) => e.courseId));
  const waitMap = new Map(myWaitlists.map((w) => [w.courseId, w]));
  const enrollmentByCourse = new Map(myEnrollments.map((e) => [e.courseId, e]));

  const waitPositions = new Map<string, number>();
  for (const w of myWaitlists) {
    const pos = await prisma.enrollmentWaitlist.count({
      where: { courseId: w.courseId, createdAt: { lte: w.createdAt } },
    });
    waitPositions.set(w.courseId, pos);
  }

  const myTimetableSlots: ScheduleSlot[] = [];
  for (const e of myAllEnrollments) {
    myTimetableSlots.push(...parseScheduleSlotsJson(e.course.scheduleSlotsJson, e.course.id));
  }

  return { enrolledSet, waitMap, waitPositions, enrollmentByCourse, myTimetableSlots };
}

export async function buildCatalogForUser(
  userId: string,
  filters: {
    semesterKey?: string;
    search?: string;
    teacher?: string;
    className?: string;
    courseCode?: string;
    scheduleTime?: string;
    scheduleRoom?: string;
    courseNatures?: string[];
    subjectCategories?: string[];
    offeringColleges?: string[];
  },
): Promise<{ courses: CatalogCourse[]; total: number }> {
  const sem = filters.semesterKey ?? currentSemester().key;

  const and: Prisma.CourseWhereInput[] = [{ published: true, semesterKey: sem }];

  if (filters.courseCode?.trim()) {
    and.push({
      courseCode: { contains: filters.courseCode.trim(), mode: "insensitive" },
    });
  }
  if (filters.teacher?.trim()) {
    and.push({ teacher: { name: { contains: filters.teacher.trim(), mode: "insensitive" } } });
  }
  if (filters.className?.trim()) {
    and.push({
      classes: { some: { name: { contains: filters.className.trim(), mode: "insensitive" } } },
    });
  }
  if (filters.scheduleTime?.trim()) {
    and.push(buildScheduleTimeFilter(filters.scheduleTime));
  }
  if (filters.scheduleRoom?.trim()) {
    and.push({
      scheduleSlotsJson: { contains: filters.scheduleRoom.trim(), mode: "insensitive" },
    });
  }

  // 三个筛选模块之间为 AND；同一模块内多选为 OR
  if (filters.courseNatures?.length) {
    and.push({ courseNature: { in: filters.courseNatures as any } });
  }
  if (filters.subjectCategories?.length) {
    and.push({ subjectCategory: { in: filters.subjectCategories as any } });
  }
  if (filters.offeringColleges?.length) {
    and.push({ offeringCollegeCode: { in: filters.offeringColleges } });
  }

  const list = (await prisma.course.findMany({
    where: { AND: and },
    orderBy: [{ courseCode: "asc" }, { title: "asc" }],
    include: {
      teacher: { select: { id: true, name: true } },
      classes: { select: { id: true, name: true } },
      _count: { select: { enrollments: true, waitlists: true } },
    },
  })) as CourseListRow[];

  const ctx = await loadCatalogContext(
    userId,
    list.map((c) => c.id),
  );

  const courses = list.map((c) => mapCourseRow(c, ctx));

  return { courses, total: courses.length };
}

export type ClassScheduleRecommendation = {
  classId: string | null;
  className: string;
  peerCount: number;
  message: string;
  courses: CatalogCourse[];
};

/** 根据同班同学的已选课程，推荐本学期可选课程 */
export async function buildClassScheduleRecommendations(
  userId: string,
): Promise<ClassScheduleRecommendation> {
  const sem = currentSemester().key;

  const myEnrollments = await prisma.enrollment.findMany({
    where: { userId, course: { semesterKey: sem } },
    select: { classId: true, courseId: true },
  });

  let classIds = [...new Set(myEnrollments.map((e) => e.classId).filter(Boolean))] as string[];
  let className = "";

  if (classIds.length) {
    const row = await prisma.class.findUnique({ where: { id: classIds[0] } });
    className = row?.name ?? "";
  } else {
    const demoClass = await prisma.class.findFirst({
      where: { name: { contains: "班" } },
      orderBy: { name: "asc" },
    });
    if (demoClass) {
      classIds = [demoClass.id];
      className = demoClass.name;
    }
  }

  const myCourseIds = new Set(
    (
      await prisma.enrollment.findMany({
        where: { userId, course: { semesterKey: sem } },
        select: { courseId: true },
      })
    ).map((e) => e.courseId),
  );

  let mateIds: string[] = [];
  if (classIds.length) {
    const mates = await prisma.enrollment.findMany({
      where: { classId: { in: classIds }, userId: { not: userId } },
      select: { userId: true },
      distinct: ["userId"],
    });
    mateIds = mates.map((m) => m.userId);
  }

  if (!mateIds.length) {
    const mates = await prisma.enrollment.findMany({
      where: {
        userId: { not: userId },
        course: { semesterKey: sem, published: true },
      },
      select: { userId: true },
      distinct: ["userId"],
      take: 30,
    });
    mateIds = mates.map((m) => m.userId);
    if (!className) className = "同年级同学";
  }

  const peerGroups = await prisma.enrollment.groupBy({
    by: ["courseId"],
    where: {
      userId: { in: mateIds },
      course: { semesterKey: sem, published: true },
      courseId: { notIn: [...myCourseIds] },
    },
    _count: { courseId: true },
    orderBy: { _count: { courseId: "desc" } },
    take: 12,
  });

  if (!peerGroups.length) {
    return {
      classId: classIds[0] ?? null,
      className: className || "未识别班级",
      peerCount: mateIds.length,
      message:
        mateIds.length > 0
          ? "同班同学暂无额外推荐课程，请在下方课程列表中自行查询。"
          : "暂无同班数据，系统展示本学期全部可选课程。",
      courses: [],
    };
  }

  const courseIds = peerGroups.map((g) => g.courseId);
  const pickMap = new Map(peerGroups.map((g) => [g.courseId, g._count.courseId]));

  const list = (await prisma.course.findMany({
    where: { id: { in: courseIds } },
    include: {
      teacher: { select: { id: true, name: true } },
      classes: { select: { id: true, name: true } },
      _count: { select: { enrollments: true, waitlists: true } },
    },
  })) as CourseListRow[];

  const ctx = await loadCatalogContext(userId, courseIds);

  const courses = list
    .map((c) =>
      mapCourseRow(c, {
        ...ctx,
        extra: {
          classmatePickCount: pickMap.get(c.id) ?? 0,
          recommendReason: `${pickMap.get(c.id) ?? 0} 名同班同学已选`,
        },
      }),
    )
    .sort((a, b) => (b.classmatePickCount ?? 0) - (a.classmatePickCount ?? 0));

  return {
    classId: classIds[0] ?? null,
    className: className || "同班推荐",
    peerCount: mateIds.length,
    message: `根据 ${className || "班级"} 课表与 ${mateIds.length} 名同学的已选课程生成推荐`,
    courses,
  };
}
