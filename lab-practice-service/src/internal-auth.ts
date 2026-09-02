import { timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { labConfig } from "./config.js";

function equalToken(actual: string, expected: string) {
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function internalRequired(expected = labConfig.internalServiceToken) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const value = request.headers["x-internal-service-token"];
    const actual = Array.isArray(value) ? value[0] : value;
    if (!actual || !expected || !equalToken(actual, expected)) {
      return reply.code(401).send({
        code: "INTERNAL_UNAUTHORIZED",
        message: "内部服务凭证无效",
        requestId: request.id,
      });
    }
  };
}
