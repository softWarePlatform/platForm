import type { FastifyRequest } from "fastify";
import { prisma } from "./prisma.js";

type AdminOperationLogInput = {
  action: string;
  targetType: string;
  targetId?: string | null;
  targetLabel?: string | null;
  detail?: unknown;
};

export async function writeAdminOperationLog(
  req: FastifyRequest,
  input: AdminOperationLogInput,
) {
  await prisma.adminOperationLog.create({
    data: {
      operatorId: req.auth?.sub ?? null,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      targetLabel: input.targetLabel ?? null,
      detailJson: input.detail === undefined ? null : JSON.stringify(input.detail),
      ip: req.ip,
      userAgent: req.headers["user-agent"] ?? null,
    },
  });
}
