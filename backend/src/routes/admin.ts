import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { authRequired } from "../lib/authGuard.js";
import { prisma } from "../lib/prisma.js";
import { currentSemester } from "../lib/semester.js";
import { writeAdminOperationLog } from "../lib/admin-operation-log.js";

const ADMIN_ACTION_LABELS: Record<string, string> = {
  USER_DELETE: "删除用户",
  COURSE_DELETE: "删除课程",
  ENROLLMENT_PERIOD_UPDATE: "更新选课时段",
  COURSE_ENROLLMENT_UPDATE: "更新课程选课字段",
  MANUAL_ENROLL: "手动加课",
  MANUAL_DROP: "手动退课",
};

function parseDetail(detailJson: string | null) {
  if (!detailJson) return null;
  try {
    return JSON.parse(detailJson) as unknown;
  } catch {
    return detailJson;
  }
}

const adminRoutes: FastifyPluginAsync = async (app) => {
  /** 超级管理员控制台概览 */
  app.get("/admin/overview", { preHandler: authRequired("ADMIN") }, async () => {
    const sem = currentSemester();

    const [roleCounts, courseTotal, coursePublished, courseSemester, enrollmentSemester, period] =
      await Promise.all([
        prisma.user.groupBy({ by: ["role"], _count: { _all: true } }),
        prisma.course.count(),
        prisma.course.count({ where: { published: true } }),
        prisma.course.count({ where: { semesterKey: sem.key } }),
        prisma.enrollment.count({ where: { course: { semesterKey: sem.key } } }),
        prisma.enrollmentPeriod.findUnique({ where: { semesterKey: sem.key } }),
      ]);

    const byRole = Object.fromEntries(
      roleCounts.map((r: (typeof roleCounts)[number]) => [r.role, r._count._all]),
    ) as Record<string, number>;

    return {
      semester: sem,
      users: {
        total: Object.values(byRole).reduce((a, b) => a + b, 0),
        student: byRole.STUDENT ?? 0,
        teacher: byRole.TEACHER ?? 0,
        admin: byRole.ADMIN ?? 0,
      },
      courses: {
        total: courseTotal,
        published: coursePublished,
        currentSemester: courseSemester,
      },
      enrollments: { currentSemester: enrollmentSemester },
      enrollmentPeriod: period
        ? {
            phase: period.phase,
            label: period.label,
            openAt: period.openAt.toISOString(),
            closeAt: period.closeAt.toISOString(),
            confirmDeadline: period.confirmDeadline?.toISOString() ?? null,
          }
        : null,
    };
  });

  /** 超级管理员：用户列表 */
  app.get(
    "/admin/users",
    { preHandler: authRequired("ADMIN") },
    async (req, reply) => {
      const querySchema = z.object({
        q: z.string().trim().max(100).optional(),
        role: z.enum(["STUDENT", "TEACHER", "ADMIN"]).optional(),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(50),
      });
      const parsed = querySchema.safeParse(req.query);
      if (!parsed.success) return reply.code(400).send({ error: "参数无效" });

      const { q, role, page, pageSize } = parsed.data;
      const where = {
        ...(role ? { role } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" as const } },
                { email: { contains: q, mode: "insensitive" as const } },
              ],
            }
          : {}),
      };

      const [total, users] = await Promise.all([
        prisma.user.count({ where }),
        prisma.user.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            createdAt: true,
            emailVerifiedAt: true,
          },
        }),
      ]);

      return {
        users: users.map((u) => ({
          ...u,
          createdAt: u.createdAt.toISOString(),
          emailVerifiedAt: u.emailVerifiedAt?.toISOString() ?? null,
        })),
        pagination: {
          page,
          pageSize,
          total,
          pageCount: Math.max(1, Math.ceil(total / pageSize)),
        },
      };
    },
  );

  /** 超级管理员：操作日志 */
  app.get(
    "/admin/logs",
    { preHandler: authRequired("ADMIN") },
    async (req, reply) => {
      const querySchema = z.object({
        q: z.string().trim().max(100).optional(),
        action: z.string().trim().max(80).optional(),
        targetType: z.string().trim().max(80).optional(),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(50),
      });
      const parsed = querySchema.safeParse(req.query);
      if (!parsed.success) return reply.code(400).send({ error: "参数无效" });

      const { q, action, targetType, page, pageSize } = parsed.data;
      const where = {
        ...(action ? { action } : {}),
        ...(targetType ? { targetType } : {}),
        ...(q
          ? {
              OR: [
                { action: { contains: q, mode: "insensitive" as const } },
                { targetType: { contains: q, mode: "insensitive" as const } },
                { targetLabel: { contains: q, mode: "insensitive" as const } },
                { operator: { name: { contains: q, mode: "insensitive" as const } } },
                { operator: { email: { contains: q, mode: "insensitive" as const } } },
              ],
            }
          : {}),
      };

      const [total, logs] = await Promise.all([
        prisma.adminOperationLog.count({ where }),
        prisma.adminOperationLog.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: { operator: { select: { id: true, name: true, email: true } } },
        }),
      ]);

      return {
        logs: logs.map((log) => ({
          id: log.id,
          action: log.action,
          actionLabel: ADMIN_ACTION_LABELS[log.action] ?? log.action,
          targetType: log.targetType,
          targetId: log.targetId,
          targetLabel: log.targetLabel,
          detail: parseDetail(log.detailJson),
          ip: log.ip,
          userAgent: log.userAgent,
          createdAt: log.createdAt.toISOString(),
          operator: log.operator,
        })),
        filters: {
          actions: ADMIN_ACTION_LABELS,
          targetTypes: {
            USER: "用户",
            ENROLLMENT_PERIOD: "选课时段",
            COURSE: "课程",
            ENROLLMENT: "选课记录",
          },
        },
        pagination: {
          page,
          pageSize,
          total,
          pageCount: Math.max(1, Math.ceil(total / pageSize)),
        },
      };
    },
  );

  /** 超级管理员：删除用户 */
  app.delete(
    "/admin/users/:id",
    { preHandler: authRequired("ADMIN") },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const operatorId = req.auth!.sub;

      if (id === operatorId) {
        return reply.code(400).send({ error: "不能删除自己的账号" });
      }

      const target = await prisma.user.findUnique({
        where: { id },
        select: { id: true, role: true, name: true, email: true },
      });
      if (!target) return reply.code(404).send({ error: "用户不存在" });

      if (target.role === "ADMIN") {
        const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
        if (adminCount <= 1) {
          return reply.code(400).send({ error: "不能删除最后一个超级管理员" });
        }
      }

      const teachingCount = await prisma.course.count({ where: { teacherId: id } });
      if (teachingCount > 0) {
        return reply.code(400).send({
          error: `该用户担任 ${teachingCount} 门课程的授课教师，请先转移课程再删除`,
        });
      }

      await prisma.user.delete({ where: { id } });
      await writeAdminOperationLog(req, {
        action: "USER_DELETE",
        targetType: "USER",
        targetId: target.id,
        targetLabel: `${target.name}（${target.email}）`,
        detail: { role: target.role, email: target.email, name: target.name },
      });
      return { ok: true, deleted: { id: target.id, email: target.email, name: target.name } };
    },
  );
};

export default adminRoutes;
