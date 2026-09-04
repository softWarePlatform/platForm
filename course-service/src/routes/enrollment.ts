import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { authRequired } from "../lib/auth.js";
import { semesterKey } from "../lib/course-access.js";
import { prisma } from "../lib/prisma.js";

type Slot = { dayOfWeek: number; periodStart: number; periodEnd: number; room?: string };

const DAY_NAMES = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const COURSE_NATURE_LABELS: Record<string, string> = {
  REQUIRED: "必修",
  RENXIU: "任修",
  ELECTIVE: "选修",
};
const SUBJECT_CATEGORY_LABELS: Record<string, string> = {
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
const ENROLLMENT_PHASE_LABELS: Record<string, string> = {
  PRESELECT: "预选课",
  FORMAL: "正选",
  ADD_DROP: "补退选",
  CLOSED: "已关闭",
};

function slots(raw: string | null): Slot[] {
  try { return raw ? JSON.parse(raw) as Slot[] : []; } catch { return []; }
}

function hasConflict(left: string | null, right: string | null) {
  return slots(left).some((a) => slots(right).some((b) => a.dayOfWeek === b.dayOfWeek && a.periodStart <= b.periodEnd && b.periodStart <= a.periodEnd));
}

function scheduleSummary(value: string | null) {
  const items = slots(value);
  if (!items.length) return "时间待定";
  return items.map((item) => {
    const day = DAY_NAMES[item.dayOfWeek] ?? `周${item.dayOfWeek}`;
    return `${day} 第${item.periodStart}-${item.periodEnd}节${item.room ? ` ${item.room}` : ""}`;
  }).join("；");
}

function scheduleDetail(value: string | null, teacherName: string) {
  const items = slots(value);
  if (!items.length) return "时间待定";
  return items.map((item) => {
    const day = DAY_NAMES[item.dayOfWeek] ?? `周${item.dayOfWeek}`;
    return `1-16周[理论]/${day}/第${item.periodStart}节-第${item.periodEnd}节/${teacherName}[主讲]/${item.room || "教室待定"}`;
  }).join("；");
}

function windowPayload(period: Awaited<ReturnType<typeof enrollmentOpen>>["period"], open: boolean) {
  const phase = period?.phase ?? "CLOSED";
  return {
    open,
    phase,
    phaseLabel: ENROLLMENT_PHASE_LABELS[phase] ?? phase,
    message: open ? "选课开放中" : "当前不在选课时间内",
    semesterKey: semesterKey(),
    semesterLabel: period?.label ?? semesterKey(),
    openAt: period?.openAt ?? null,
    closeAt: period?.closeAt ?? null,
  };
}

async function enrollmentOpen() {
  const period = await prisma.enrollmentPeriod.findUnique({ where: { semesterKey: semesterKey() } });
  const now = new Date();
  return { period, open: Boolean(period && period.phase !== "CLOSED" && period.openAt <= now && now <= period.closeAt) };
}

const enrollmentRoutes: FastifyPluginAsync = async (app) => {
  app.get("/enrollment/status", { preHandler: authRequired() }, async () => {
    const { period, open } = await enrollmentOpen();
    const window = windowPayload(period, open);
    return {
      ...window,
      window,
      labels: {
        courseNatures: COURSE_NATURE_LABELS,
        subjectCategories: SUBJECT_CATEGORY_LABELS,
        offeringColleges: {},
        phases: ENROLLMENT_PHASE_LABELS,
      },
    };
  });

  app.get("/enrollment/catalog", { preHandler: authRequired("STUDENT", "ADMIN") }, async (request, reply) => {
    const query = z.object({ search: z.string().optional(), semesterKey: z.string().optional() }).safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: "参数无效" });
    const where = { published: true, semesterKey: query.data.semesterKey ?? semesterKey(), ...(query.data.search ? { OR: [{ title: { contains: query.data.search, mode: "insensitive" as const } }, { courseCode: { contains: query.data.search, mode: "insensitive" as const } }] } : {}) };
    const courses = await prisma.course.findMany({
      where,
      include: {
        teacher: { select: { id: true, name: true } },
        classes: { include: { _count: { select: { enrollments: true } } }, orderBy: { name: "asc" } },
        _count: { select: { enrollments: true, waitlists: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    const [mine, myWaitlists, mySchedule] = await Promise.all([
      prisma.enrollment.findMany({ where: { userId: request.auth!.sub }, select: { courseId: true, classId: true } }),
      prisma.enrollmentWaitlist.findMany({ where: { userId: request.auth!.sub }, select: { courseId: true, createdAt: true } }),
      prisma.enrollment.findMany({ where: { userId: request.auth!.sub }, include: { course: { select: { scheduleSlotsJson: true } } } }),
    ]);
    const enrollmentByCourse = new Map(mine.map((row) => [row.courseId, row]));
    const waitlistByCourse = new Map(myWaitlists.map((row) => [row.courseId, row]));
    const state = await enrollmentOpen();
    const myScheduleJson = mySchedule.map((row) => row.course.scheduleSlotsJson);
    const result = courses.map((course) => {
      const enrollment = enrollmentByCourse.get(course.id);
      const conflict = !enrollment && myScheduleJson.some((value) => hasConflict(course.scheduleSlotsJson, value));
      const isFull = course._count.enrollments >= course.capacity;
      const natureLabel = COURSE_NATURE_LABELS[course.courseNature] ?? course.courseNature;
      const subjectLabel = SUBJECT_CATEGORY_LABELS[course.subjectCategory] ?? course.subjectCategory;
      const department = course.offeringCollegeCode || course.category || "待定开课单位";
      const detail = scheduleDetail(course.scheduleSlotsJson, course.teacher.name);
      const sections = course.classes.length
        ? course.classes.map((item, index) => ({
            sectionId: item.id,
            sectionLabel: `[${String(index + 1).padStart(3, "0")}]${course.teacher.name}`,
            teacherName: `${item.name} / ${course.teacher.name}`,
            courseNatureLabel: natureLabel,
            subjectCategoryLabel: subjectLabel,
            department,
            scheduleDetail: detail,
            capacity: course.capacity,
            enrolledCount: item._count.enrollments,
            isFull,
            isSelected: enrollment?.classId === item.id,
            scheduleConflict: conflict,
          }))
        : [{
            sectionId: course.id,
            sectionLabel: `[001]${course.teacher.name}`,
            teacherName: course.teacher.name,
            courseNatureLabel: natureLabel,
            subjectCategoryLabel: subjectLabel,
            department,
            scheduleDetail: detail,
            capacity: course.capacity,
            enrolledCount: course._count.enrollments,
            isFull,
            isSelected: Boolean(enrollment),
            scheduleConflict: conflict,
          }];
      return {
        id: course.id,
        title: course.title,
        courseCode: course.courseCode,
        credits: course.credits,
        capacity: course.capacity,
        enrolledCount: course._count.enrollments,
        waitlistCount: course._count.waitlists,
        isFull,
        full: isFull,
        courseNature: course.courseNature,
        courseNatureLabel: natureLabel,
        subjectCategory: course.subjectCategory,
        subjectCategoryLabel: subjectLabel,
        offeringCollegeCode: course.offeringCollegeCode,
        offeringCollegeLabel: course.offeringCollegeCode ?? "",
        category: course.category,
        teacher: course.teacher,
        scheduleSummary: scheduleSummary(course.scheduleSlotsJson),
        isEnrolled: Boolean(enrollment),
        enrolled: Boolean(enrollment),
        isWaitlisted: waitlistByCourse.has(course.id),
        waitlistPosition: null,
        selectedSectionCount: sections.filter((item) => item.isSelected).length,
        scheduleConflict: conflict,
        sections,
      };
    });
    return { window: windowPayload(state.period, state.open), courses: result, total: result.length, matchedCount: result.length };
  });

  app.post("/enrollment/courses/:courseId/enroll", { preHandler: authRequired("STUDENT", "ADMIN") }, async (request, reply) => {
    const params = z.object({ courseId: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "课程 ID 无效" });
    const state = await enrollmentOpen();
    if (!state.open) return reply.code(403).send({ error: "当前不在选课时间内" });
    try {
      const enrollment = await prisma.$transaction(async (tx) => {
        const course = await tx.course.findUnique({ where: { id: params.data.courseId } });
        if (!course || !course.published) throw Object.assign(new Error("课程不存在或未发布"), { statusCode: 404 });
        if (await tx.enrollment.findUnique({ where: { userId_courseId: { userId: request.auth!.sub, courseId: course.id } } })) throw Object.assign(new Error("已经选过该课程"), { statusCode: 409 });
        const count = await tx.enrollment.count({ where: { courseId: course.id } });
        if (count >= course.capacity) throw Object.assign(new Error("课程已满，请加入候补"), { statusCode: 409 });
        const existing = await tx.enrollment.findMany({ where: { userId: request.auth!.sub }, include: { course: { select: { scheduleSlotsJson: true } } } });
        if (existing.some((row) => hasConflict(course.scheduleSlotsJson, row.course.scheduleSlotsJson))) throw Object.assign(new Error("课程时间冲突"), { statusCode: 409 });
        const created = await tx.enrollment.create({ data: { userId: request.auth!.sub, courseId: course.id } });
        await tx.enrollmentLog.create({ data: { userId: request.auth!.sub, courseId: course.id, operatorId: request.auth!.sub, action: "ENROLL" } });
        return created;
      });
      return reply.code(201).send({ ok: true, enrollment });
    } catch (error) {
      const detail = error as Error & { statusCode?: number };
      return reply.code(detail.statusCode ?? 500).send({ error: detail.message || "选课失败" });
    }
  });

  app.delete("/enrollment/courses/:courseId/enroll", { preHandler: authRequired("STUDENT", "ADMIN") }, async (request, reply) => {
    const params = z.object({ courseId: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "课程 ID 无效" });
    const result = await prisma.$transaction(async (tx) => {
      const enrollment = await tx.enrollment.findUnique({ where: { userId_courseId: { userId: request.auth!.sub, courseId: params.data.courseId } } });
      if (!enrollment) return null;
      await tx.enrollment.delete({ where: { id: enrollment.id } });
      await tx.enrollmentLog.create({ data: { userId: request.auth!.sub, courseId: params.data.courseId, operatorId: request.auth!.sub, action: "DROP" } });
      const candidate = await tx.enrollmentWaitlist.findFirst({ where: { courseId: params.data.courseId }, orderBy: { createdAt: "asc" } });
      if (candidate) {
        await tx.enrollment.create({ data: { userId: candidate.userId, courseId: candidate.courseId } });
        await tx.enrollmentWaitlist.delete({ where: { id: candidate.id } });
        await tx.enrollmentLog.create({ data: { userId: candidate.userId, courseId: candidate.courseId, action: "WAITLIST_PROMOTED" } });
        await tx.siteNotification.create({ data: { userId: candidate.userId, type: "ENROLLMENT", title: "候补已转正", body: "已有名额，请查看我的课程", linkPath: `/courses/${candidate.courseId}` } });
      }
      return { promotedUserId: candidate?.userId ?? null };
    });
    if (!result) return reply.code(404).send({ error: "未找到选课记录" });
    return { ok: true, ...result };
  });

  app.post("/enrollment/courses/:courseId/waitlist", { preHandler: authRequired("STUDENT", "ADMIN") }, async (request, reply) => {
    const params = z.object({ courseId: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "课程 ID 无效" });
    try {
      const course = await prisma.course.findUnique({ where: { id: params.data.courseId }, include: { _count: { select: { enrollments: true } } } });
      if (!course || !course.published) return reply.code(404).send({ error: "课程不存在或未发布" });
      if (course._count.enrollments < course.capacity) return reply.code(409).send({ error: "课程尚有名额，请直接选课" });
      const row = await prisma.enrollmentWaitlist.create({ data: { userId: request.auth!.sub, courseId: course.id } });
      await prisma.enrollmentLog.create({ data: { userId: request.auth!.sub, courseId: course.id, operatorId: request.auth!.sub, action: "WAITLIST_JOIN" } });
      return reply.code(201).send({ ok: true, waitlist: row });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") return reply.code(409).send({ error: "已经在候补队列中" });
      throw error;
    }
  });
};

export default enrollmentRoutes;
