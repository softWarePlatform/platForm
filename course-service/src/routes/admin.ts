import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { authRequired } from "../lib/auth.js";
import { semesterKey } from "../lib/course-access.js";
import { prisma } from "../lib/prisma.js";

const adminRoutes: FastifyPluginAsync = async (app) => {
  app.get("/admin/users", { preHandler: authRequired("ADMIN") }, async () => ({ users: await prisma.user.findMany({ select: { id: true, email: true, name: true, role: true, createdAt: true }, orderBy: { createdAt: "desc" } }) }));
  app.get("/admin/enrollment-period", { preHandler: authRequired("ADMIN") }, async () => ({ period: await prisma.enrollmentPeriod.findUnique({ where: { semesterKey: semesterKey() } }) }));
  app.put("/admin/enrollment-period", { preHandler: authRequired("ADMIN") }, async (request, reply) => {
    const body = z.object({ semesterKey: z.string().optional(), label: z.string().optional(), phase: z.enum(["PRESELECT", "FORMAL", "ADD_DROP", "CLOSED"]), openAt: z.coerce.date(), closeAt: z.coerce.date(), confirmDeadline: z.coerce.date().optional().nullable() }).safeParse(request.body);
    if (!body.success || body.data.openAt >= body.data.closeAt) return reply.code(400).send({ error: "选课阶段或时间范围无效" });
    const key = body.data.semesterKey ?? semesterKey();
    const period = await prisma.enrollmentPeriod.upsert({ where: { semesterKey: key }, create: { semesterKey: key, label: body.data.label, phase: body.data.phase, openAt: body.data.openAt, closeAt: body.data.closeAt, confirmDeadline: body.data.confirmDeadline }, update: { label: body.data.label, phase: body.data.phase, openAt: body.data.openAt, closeAt: body.data.closeAt, confirmDeadline: body.data.confirmDeadline } });
    return { period };
  });
  app.get("/admin/enrollment-logs", { preHandler: authRequired("ADMIN") }, async () => ({ logs: await prisma.enrollmentLog.findMany({ include: { user: { select: { id: true, name: true, email: true } }, course: { select: { id: true, title: true } }, operator: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" }, take: 200 }) }));
};

export default adminRoutes;
