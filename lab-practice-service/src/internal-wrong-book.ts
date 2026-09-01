import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { internalAuth } from "../../backend/src/lib/internal-auth.js";
import {
  saveHomeworkWrongBookEntries,
  type SaveHomeworkWrongBookInput,
  type SavedWrongBookEntry,
} from "../../backend/src/lib/wrong-book-write.js";

type Options = {
  token?: string;
  saveEntries?: (input: SaveHomeworkWrongBookInput) => Promise<SavedWrongBookEntry[]>;
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

const internalWrongBookRoutes: FastifyPluginAsync<Options> = async (app, options) => {
  const authenticate = internalAuth(options.token);
  const saveEntries = options.saveEntries ?? saveHomeworkWrongBookEntries;

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
