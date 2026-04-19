import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { Role } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { signToken } from "../lib/jwt.js";
import { authRequired, optionalAuth } from "../lib/authGuard.js";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  role: z.enum(["STUDENT", "TEACHER"]).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const authRoutes: FastifyPluginAsync = async (app) => {
  app.post("/auth/register", async (req, reply) => {
    const body = registerSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "参数无效", details: body.error.flatten() });

    const exists = await prisma.user.findUnique({ where: { email: body.data.email } });
    if (exists) return reply.code(409).send({ error: "该邮箱已注册" });

    const role = (body.data.role ?? "STUDENT") as Role;
    const user = await prisma.user.create({
      data: {
        email: body.data.email,
        name: body.data.name,
        role,
        passwordHash: await hashPassword(body.data.password),
      },
      select: { id: true, email: true, name: true, role: true },
    });

    const token = signToken({ sub: user.id, email: user.email, role: user.role });
    return { user, token };
  });

  app.post("/auth/login", async (req, reply) => {
    const body = loginSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "参数无效" });

    const user = await prisma.user.findUnique({ where: { email: body.data.email } });
    if (!user || !(await verifyPassword(body.data.password, user.passwordHash))) {
      return reply.code(401).send({ error: "邮箱或密码错误" });
    }

    const token = signToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatarUrl: user.avatarUrl,
      },
    };
  });

  app.get("/auth/me", { preHandler: optionalAuth }, async (req, reply) => {
    if (!req.auth) return reply.code(401).send({ error: "未登录" });
    const user = await prisma.user.findUnique({
      where: { id: req.auth.sub },
      select: { id: true, email: true, name: true, role: true, avatarUrl: true },
    });
    if (!user) return reply.code(404).send({ error: "用户不存在" });
    return { user };
  });

  app.patch(
    "/auth/me",
    { preHandler: authRequired() },
    async (req, reply) => {
      const schema = z.object({
        name: z.string().min(1).optional(),
        avatarUrl: z.string().url().nullable().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "参数无效" });

      const user = await prisma.user.update({
        where: { id: req.auth!.sub },
        data: parsed.data,
        select: { id: true, email: true, name: true, role: true, avatarUrl: true },
      });
      return { user };
    },
  );
};

export default authRoutes;
