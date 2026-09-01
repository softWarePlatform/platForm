import bcrypt from "bcryptjs";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { authRequired } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";
import { signToken } from "../lib/auth.js";

const authRoutes: FastifyPluginAsync = async (app) => {
  app.post("/auth/register", async (request, reply) => {
    const body = z.object({ email: z.string().email(), password: z.string().min(8), name: z.string().min(1), role: z.enum(["STUDENT", "TEACHER"]).optional() }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "参数无效" });
    if (await prisma.user.findUnique({ where: { email: body.data.email } })) return reply.code(409).send({ error: "该邮箱已注册" });
    const user = await prisma.user.create({ data: { email: body.data.email, name: body.data.name, role: body.data.role ?? "STUDENT", passwordHash: await bcrypt.hash(body.data.password, 10) } });
    return { user: { id: user.id, email: user.email, name: user.name, role: user.role }, token: signToken({ sub: user.id, email: user.email, role: user.role }) };
  });

  app.post("/auth/login", async (request, reply) => {
    const body = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "参数无效" });
    const user = await prisma.user.findUnique({ where: { email: body.data.email } });
    if (!user || !(await bcrypt.compare(body.data.password, user.passwordHash))) return reply.code(401).send({ error: "邮箱或密码错误" });
    return { user: { id: user.id, email: user.email, name: user.name, role: user.role }, token: signToken({ sub: user.id, email: user.email, role: user.role }) };
  });

  app.get("/auth/me", { preHandler: authRequired() }, async (request, reply) => {
    const user = await prisma.user.findUnique({ where: { id: request.auth!.sub }, select: { id: true, email: true, name: true, role: true, avatarUrl: true, signature: true } });
    if (!user) return reply.code(404).send({ error: "用户不存在" });
    return { user };
  });
};

export default authRoutes;
