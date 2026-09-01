import { timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "./config.js";

function tokensEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

/** 仅允许持有服务间共享密钥的调用方访问 /internal 接口。 */
export function internalAuth(expectedToken = config.internalApiToken) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!expectedToken) {
      return reply.code(503).send({ error: "内部接口未配置" });
    }

    const header = req.headers["x-internal-token"];
    const actualToken = Array.isArray(header) ? header[0] : header;
    if (!actualToken || !tokensEqual(actualToken, expectedToken)) {
      return reply.code(401).send({ error: "内部服务凭证无效" });
    }
  };
}
