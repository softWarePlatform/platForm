import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { config } from "./lib/config.js";
import healthRoutes from "./routes/health.js";
import authRoutes from "./routes/auth.js";
import coursesRoutes from "./routes/courses.js";
import labsRoutes from "./routes/labs.js";
import homeworkRoutes from "./routes/homework.js";
import gradesRoutes from "./routes/grades.js";
import discussionsRoutes from "./routes/discussions.js";

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

  await app.register(rateLimit, {
    global: true,
    max: 600,
    timeWindow: "1 minute",
  });

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(coursesRoutes);
  await app.register(labsRoutes);
  await app.register(homeworkRoutes);
  await app.register(gradesRoutes);
  await app.register(discussionsRoutes);

  await app.listen({ port: config.port, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
