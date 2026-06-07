import type { FastifyPluginAsync } from "fastify";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { Role } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { signToken } from "../lib/jwt.js";
import { authRequired, optionalAuth } from "../lib/authGuard.js";

const userPublicSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  avatarUrl: true,
  signature: true,
  emailVerifiedAt: true,
} as const;

function toPublicUser(user: {
  id: string;
  email: string;
  name: string;
  role: Role;
  avatarUrl: string | null;
  signature?: string | null;
  emailVerifiedAt: Date | null;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    avatarUrl: user.avatarUrl,
    signature: user.signature ?? null,
    emailVerified: !!user.emailVerifiedAt,
  };
}

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
  app.post("/auth/register", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const body = registerSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "参数无效", details: body.error.flatten() });

    const exists = await prisma.user.findUnique({ where: { email: body.data.email } });
    if (exists) return reply.code(409).send({ error: "该邮箱已注册" });

    const role = (body.data.role ?? "STUDENT") as Role;
    const verifyToken = randomBytes(24).toString("hex");
    const user = await prisma.user.create({
      data: {
        email: body.data.email,
        name: body.data.name,
        role,
        passwordHash: await hashPassword(body.data.password),
        emailVerifyToken: verifyToken,
        emailVerifyExpiresAt: new Date(Date.now() + 48 * 3600 * 1000),
      },
      select: { id: true, email: true, name: true, role: true, emailVerifiedAt: true },
    });

    const token = signToken({ sub: user.id, email: user.email, role: user.role });
    return { user, token, verifyTokenHint: verifyToken };
  });

  app.post("/auth/login", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
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
      user: toPublicUser(user),
    };
  });

  app.get("/auth/me", { preHandler: optionalAuth }, async (req, reply) => {
    if (!req.auth) return reply.code(401).send({ error: "未登录" });
    const user = await prisma.user.findUnique({
      where: { id: req.auth.sub },
      select: userPublicSelect,
    });
    if (!user) return reply.code(404).send({ error: "用户不存在" });
    return { user: toPublicUser(user) };
  });

  app.patch(
    "/auth/me",
    { preHandler: authRequired() },
    async (req, reply) => {
      const schema = z.object({
        name: z.string().min(1).optional(),
        avatarUrl: z.string().url().nullable().optional(),
        signature: z.string().max(120).nullable().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "参数无效" });

      const data: { name?: string; avatarUrl?: string | null; signature?: string | null } = {};
      if (parsed.data.name !== undefined) data.name = parsed.data.name;
      if (parsed.data.avatarUrl !== undefined) data.avatarUrl = parsed.data.avatarUrl;
      if (parsed.data.signature !== undefined) {
        const s = parsed.data.signature?.trim() ?? "";
        data.signature = s.length > 0 ? s : null;
      }

      const user = await prisma.user.update({
        where: { id: req.auth!.sub },
        data,
        select: userPublicSelect,
      });
      return { user: toPublicUser(user) };
    },
  );

  app.patch(
    "/auth/password",
    { preHandler: authRequired() },
    async (req, reply) => {
      const schema = z.object({
        oldPassword: z.string().min(1),
        newPassword: z.string().min(8),
      });
      const body = schema.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "参数无效" });

      const row = await prisma.user.findUnique({ where: { id: req.auth!.sub } });
      if (!row) return reply.code(404).send({ error: "用户不存在" });
      if (!(await verifyPassword(body.data.oldPassword, row.passwordHash))) {
        return reply.code(401).send({ error: "旧密码错误" });
      }
      await prisma.user.update({
        where: { id: req.auth!.sub },
        data: { passwordHash: await hashPassword(body.data.newPassword) },
      });
      return { ok: true };
    },
  );

  /** 忘记密码：生成 token（演示环境直接返回） */
  app.post("/auth/forgot-password", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const schema = z.object({ email: z.string().email() });
    const body = schema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "参数无效" });
    const u = await prisma.user.findUnique({ where: { email: body.data.email } });
    if (!u) return { ok: true }; // 防枚举

    const token = randomBytes(24).toString("hex");
    await prisma.user.update({
      where: { id: u.id },
      data: {
        passwordResetToken: token,
        passwordResetExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });
    return { ok: true, resetTokenHint: token };
  });

  app.post("/auth/reset-password", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const schema = z.object({
      token: z.string().min(8),
      newPassword: z.string().min(8),
    });
    const body = schema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "参数无效" });

    const u = await prisma.user.findFirst({
      where: {
        passwordResetToken: body.data.token,
        passwordResetExpiresAt: { gt: new Date() },
      },
    });
    if (!u) return reply.code(400).send({ error: "令牌无效或已过期" });

    await prisma.user.update({
      where: { id: u.id },
      data: {
        passwordHash: await hashPassword(body.data.newPassword),
        passwordResetToken: null,
        passwordResetExpiresAt: null,
      },
    });
    return { ok: true };
  });

  app.post("/auth/send-verify-email", { preHandler: authRequired() }, async (req) => {
    const token = randomBytes(24).toString("hex");
    await prisma.user.update({
      where: { id: req.auth!.sub },
      data: {
        emailVerifyToken: token,
        emailVerifyExpiresAt: new Date(Date.now() + 48 * 3600 * 1000),
      },
    });
    return { ok: true, verifyTokenHint: token };
  });

  app.post("/auth/verify-email", async (req, reply) => {
    const schema = z.object({ token: z.string().min(8) });
    const body = schema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "参数无效" });

    const u = await prisma.user.findFirst({
      where: {
        emailVerifyToken: body.data.token,
        emailVerifyExpiresAt: { gt: new Date() },
      },
    });
    if (!u) return reply.code(400).send({ error: "令牌无效或已过期" });
    await prisma.user.update({
      where: { id: u.id },
      data: {
        emailVerifiedAt: new Date(),
        emailVerifyToken: null,
        emailVerifyExpiresAt: null,
      },
    });
    return { ok: true };
  });

  app.get("/admin/users", { preHandler: authRequired("ADMIN") }, async () => {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        emailVerifiedAt: true,
      },
      take: 500,
    });
    return { users };
  });
};

export default authRoutes;
