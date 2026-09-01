import type { Role } from "@prisma/client";
import type { FastifyReply, FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";
import { config } from "./config.js";

export type AuthPayload = { sub: string; email: string; role: Role };

declare module "fastify" {
  interface FastifyRequest {
    auth?: AuthPayload;
  }
}

export function signToken(payload: AuthPayload) {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: "7d" });
}

function parseToken(request: FastifyRequest): AuthPayload | undefined {
  const value = request.headers.authorization;
  if (!value?.startsWith("Bearer ")) return undefined;
  try {
    return jwt.verify(value.slice(7), config.jwtSecret) as AuthPayload;
  } catch {
    return undefined;
  }
}

export async function optionalAuth(request: FastifyRequest) {
  request.auth = parseToken(request);
}

export function authRequired(...roles: Role[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const auth = parseToken(request);
    if (!auth) return reply.code(401).send({ error: "未登录或令牌无效" });
    if (roles.length && !roles.includes(auth.role)) return reply.code(403).send({ error: "权限不足" });
    request.auth = auth;
  };
}

export async function internalRequired(request: FastifyRequest, reply: FastifyReply) {
  if (request.headers["x-internal-service-token"] !== config.internalServiceToken) {
    return reply.code(401).send({ code: "INTERNAL_UNAUTHORIZED", message: "内部调用身份无效", requestId: request.id });
  }
}
