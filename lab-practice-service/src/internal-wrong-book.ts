import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "./prisma.js";
import { internalRequired } from "./internal-auth.js";
import {
  saveHomeworkWrongBookEntries,
  type SaveHomeworkWrongBookInput,
  type SavedWrongBookEntry,
} from "./wrong-book-write.js";

type Options = {
  token?: string;
  saveEntries?: (input: SaveHomeworkWrongBookInput) => Promise<SavedWrongBookEntry[]>;
  deleteEntries?: (homeworkId: string) => Promise<number>;
};

const bodySchema = z.object({
  userId: z.string().uuid(),
  courseId: z.string().uuid(),
  homeworkId: z.string().uuid(),
  entries: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        content: z.string().trim().max(20_000),
      }),
    )
    .min(1)
    .max(100),
});

const entrySchema = z.object({
  userId: z.string().uuid(),
  courseId: z.string().uuid(),
  sourceType: z.literal("HOMEWORK"),
  sourceId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().max(20_000),
});

const deleteParamsSchema = z.object({ homeworkId: z.string().uuid() });

const internalWrongBookRoutes: FastifyPluginAsync<Options> = async (app, options) => {
  const authenticate = internalRequired(options.token);
  const saveEntries = options.saveEntries ?? saveHomeworkWrongBookEntries;
  const deleteEntries = options.deleteEntries ?? (async (homeworkId: string) => {
    const result = await prisma.wrongBookEntry.deleteMany({ where: { homeworkId } });
    return result.count;
  });

  app.put(
    "/internal/wrong-book/entries",
    { preHandler: authenticate },
    async (req, reply) => {
      const idempotencyKey = req.headers["idempotency-key"];
      if (typeof idempotencyKey !== "string" || idempotencyKey.trim() === "") {
        return reply.code(400).send({ code: "IDEMPOTENCY_KEY_REQUIRED", message: "写入错题必须提供 Idempotency-Key", requestId: req.id });
      }
      const body = entrySchema.safeParse(req.body);
      if (!body.success) {
        return reply.code(400).send({ code: "INVALID_ARGUMENT", message: "错题数据格式无效", requestId: req.id });
      }
      const [entry] = await saveEntries({
        userId: body.data.userId,
        courseId: body.data.courseId,
        homeworkId: body.data.sourceId,
        entries: [{ title: body.data.title, content: body.data.content }],
      });
      return { entry, created: entry?.created ?? false, requestId: req.id };
    },
  );

  app.delete(
    "/internal/wrong-book/entries/HOMEWORK/:homeworkId",
    { preHandler: authenticate },
    async (req, reply) => {
      const params = deleteParamsSchema.safeParse(req.params);
      if (!params.success) {
        return reply.code(400).send({ code: "INVALID_ARGUMENT", message: "作业 ID 格式无效", requestId: req.id });
      }
      const deleted = await deleteEntries(params.data.homeworkId);
      return { deleted, requestId: req.id };
    },
  );

  app.post(
    "/internal/wrong-book/homework",
    { preHandler: authenticate },
    async (req, reply) => {
      const body = bodySchema.safeParse(req.body);
      if (!body.success) {
        return reply.code(400).send({ error: "错题数据格式无效" });
      }

      const entries = await saveEntries(body.data);
      return {
        entries,
        count: entries.length,
        createdCount: entries.filter((entry) => entry.created).length,
        updatedCount: entries.filter((entry) => !entry.created).length,
      };
    },
  );
};

export default internalWrongBookRoutes;
