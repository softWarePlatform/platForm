import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "./lib/config.js";
import healthRoutes from "./routes/health.js";
import authRoutes from "./routes/auth.js";
import coursesRoutes from "./routes/courses.js";
import courseMaterialsRoutes from "./routes/course-materials.js";
import labsRoutes from "./routes/labs.js";
import labSetsRoutes from "./routes/lab-sets.js";
import labOverviewRoutes from "./routes/lab-overview.js";
import labFilesRoutes from "./routes/lab-files.js";
import homeworkRoutes from "./routes/homework.js";
import gradesRoutes from "./routes/grades.js";
import discussionsRoutes from "./routes/discussions.js";
import aiHelpRoutes from "./routes/ai-help.js";
import dashboardRoutes from "./routes/dashboard.js";
import adminRoutes from "./routes/admin.js";
import enrollmentRoutes from "./routes/enrollment.js";
import announcementsRoutes from "./routes/announcements.js";
import notificationsRoutes from "./routes/notifications.js";
import homeworkStudentRoutes from "./routes/homework-student.js";
import practiceRoutes from "./routes/practice.js";
import { resolveHomeworkAi } from "./lib/homework-ai-config.js";
import { startLabReminderScheduler } from "./lib/lab-reminders.js";

function parseOrigins(): boolean | string | string[] {
  const raw = config.corsOrigin;
  if (typeof raw === "boolean") return raw;
  if (!raw || raw === "true") return true;
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

async function main() {
  const app = Fastify({
    logger: true,
    bodyLimit: config.bodyLimitBytes,
    requestIdHeader: "x-request-id",
    requestIdLogLabel: "requestId",
  });

  await app.register(cors, {
    origin: parseOrigins(),
    credentials: true,
  });

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const helmet = (await import("@fastify/helmet")).default as any;
  await app.register(helmet, {
    global: true,
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  });

  // ESM 环境下使用动态 import 加载 multipart
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const multipart = (await import("@fastify/multipart")).default as any;
  await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } });

  await app.register(rateLimit, {
    global: true,
    max: config.globalRateLimitMaxPerMinute,
    timeWindow: "1 minute",
  });

  app.addHook("onRequest", async (req: FastifyRequest, reply: FastifyReply) => {
    reply.header("X-Request-ID", req.id);
  });

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(coursesRoutes);
  await app.register(courseMaterialsRoutes);
  await app.register(labSetsRoutes);
  await app.register(labOverviewRoutes);
  /** 含 /labs/:labId/discussions，需在通配 /labs/:id 之前注册 */
  await app.register(discussionsRoutes);
  await app.register(labsRoutes);
  await app.register(labFilesRoutes);
  await app.register(homeworkRoutes);
  await app.register(homeworkStudentRoutes);
  await app.register(gradesRoutes);
  await app.register(dashboardRoutes);
  await app.register(adminRoutes);
  await app.register(enrollmentRoutes);
  await app.register(announcementsRoutes);
  await app.register(notificationsRoutes);
  await app.register(aiHelpRoutes);
  await app.register(practiceRoutes);

  const ha = resolveHomeworkAi();
  app.log.info(
    ha.apiKey || ha.omitBearerAuth
      ? `大模型（作业批改 / 练习识题）：${ha.hint} → ${ha.baseUrl} / ${ha.model}${ha.omitBearerAuth ? "（无 Bearer）" : ""}`
      : "大模型：未配置云端密钥；练习识题将尝试本机 Ollama 或规则降级（见 backend/.env.example）",
  );

  const stopLabReminders = startLabReminderScheduler(app.log);
  app.addHook("onClose", async () => {
    stopLabReminders();
  });

  await app.listen({ port: config.port, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
