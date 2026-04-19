import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { config } from "./lib/config.js";
import healthRoutes from "./routes/health.js";
import authRoutes from "./routes/auth.js";
import coursesRoutes from "./routes/courses.js";
import courseMaterialsRoutes from "./routes/course-materials.js";
import labsRoutes from "./routes/labs.js";
import labFilesRoutes from "./routes/lab-files.js";
import homeworkRoutes from "./routes/homework.js";
import gradesRoutes from "./routes/grades.js";
import discussionsRoutes from "./routes/discussions.js";
import aiHelpRoutes from "./routes/ai-help.js";

function parseOrigins(): boolean | string | string[] {
  const raw = config.corsOrigin;
  if (typeof raw === "boolean") return raw;
  if (!raw || raw === "true") return true;
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

async function main() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: parseOrigins(),
    credentials: true,
  });

  // 动态加载：避免 TS 在未安装依赖时直接报错（构建/运行时仍需 npm install）
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-var-requires
  const multipart = require("@fastify/multipart") as any;
  await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } });

  await app.register(rateLimit, {
    global: true,
    max: 600,
    timeWindow: "1 minute",
  });

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(coursesRoutes);
  await app.register(courseMaterialsRoutes);
  await app.register(labsRoutes);
  await app.register(labFilesRoutes);
  await app.register(homeworkRoutes);
  await app.register(gradesRoutes);
  await app.register(discussionsRoutes);
  await app.register(aiHelpRoutes);

  await app.listen({ port: config.port, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
