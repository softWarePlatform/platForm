import type { FastifyReply, FastifyRequest } from "fastify";
import type { Role } from "@lab/prisma-client-v2";
import { verifyToken } from "./jwt.js";

function parseBearer(req: FastifyRequest) {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) return undefined;
  const token = h.slice("Bearer ".length).trim();
  if (!token) return undefined;
  try {
    return verifyToken(token);
  } catch {
    return undefined;
  }
}

/** 可选：解析 JWT 到 req.auth（无令牌则保持 undefined） */
export async function optionalAuth(req: FastifyRequest) {
  req.auth = parseBearer(req);
}

/** 必须登录；可选限制角色 */
export function authRequired(...roles: Role[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const auth = parseBearer(req);
    if (!auth) {
      return reply.code(401).send({ error: "未登录或令牌无效" });
    }
    if (roles.length > 0 && !roles.includes(auth.role)) {
      return reply.code(403).send({ error: "权限不足" });
    }
    req.auth = auth;
  };
}
