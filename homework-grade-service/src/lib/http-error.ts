import type { FastifyReply, FastifyRequest } from "fastify";

export function sendError(
  reply: FastifyReply,
  request: FastifyRequest,
  status: number,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
) {
  return reply.code(status).send({ code, message, requestId: request.id, ...extra });
}
