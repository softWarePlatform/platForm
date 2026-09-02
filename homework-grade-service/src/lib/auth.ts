import type { FastifyReply, FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";
import { config } from "./config.js";
import { fetchMe } from "./course-client.js";
import { sendError } from "./http-error.js";

export type Role = "STUDENT" | "TEACHER" | "ADMIN";
export type AuthPayload = { sub: string; email: string; role: Role };

declare module "fastify" {
  interface FastifyRequest {
    auth?: AuthPayload;
    authorizationHeader?: string;
  }
}

function parseBearer(request: FastifyRequest): string | undefined {
  const value = request.headers.authorization;
  if (!value?.startsWith("Bearer ")) return undefined;
  const token = value.slice(7).trim();
  return token || undefined;
}

function verifyLocal(token: string): AuthPayload | undefined {
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as AuthPayload;
    if (!decoded?.sub || !decoded.role) return undefined;
    return decoded;
  } catch {
    return undefined;
  }
}

export async function resolveAuth(request: FastifyRequest): Promise<AuthPayload | undefined> {
  const token = parseBearer(request);
  if (!token) return undefined;
  request.authorizationHeader = `Bearer ${token}`;
  const remote = await fetchMe(`Bearer ${token}`);
  if (remote) return { sub: remote.id, email: remote.email, role: remote.role };
  return verifyLocal(token);
}

export async function optionalAuth(request: FastifyRequest) {
  request.auth = await resolveAuth(request);
}

export function authRequired(...roles: Role[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const auth = await resolveAuth(request);
    if (!auth) return sendError(reply, request, 401, "UNAUTHORIZED", "未登录或令牌无效");
    if (roles.length && !roles.includes(auth.role)) return sendError(reply, request, 403, "FORBIDDEN", "权限不足");
    request.auth = auth;
  };
}

export async function internalRequired(request: FastifyRequest, reply: FastifyReply) {
  if (request.headers["x-internal-service-token"] !== config.internalServiceToken) {
    return reply.code(401).send({
      code: "INTERNAL_UNAUTHORIZED",
      message: "内部调用身份无效",
      requestId: request.id,
    });
  }
}
