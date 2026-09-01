import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { config } from "./lib/config.js";
import adminRoutes from "./routes/admin.js";
import announcementsRoutes from "./routes/announcements.js";
import authRoutes from "./routes/auth.js";
import coursesRoutes from "./routes/courses.js";
import enrollmentRoutes from "./routes/enrollment.js";
import healthRoutes from "./routes/health.js";
import materialsRoutes from "./routes/materials.js";
import notificationsRoutes from "./routes/notifications.js";

async function main() {
  const app = Fastify({ logger: true, requestIdHeader: "x-request-id", requestIdLogLabel: "requestId" });
  await app.register(cors, { origin: config.corsOrigins, credentials: true });
  await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } });
  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(coursesRoutes);
  await app.register(enrollmentRoutes);
  await app.register(announcementsRoutes);
  await app.register(materialsRoutes);
  await app.register(notificationsRoutes);
  await app.register(adminRoutes);

  await app.listen({ port: config.port, host: "0.0.0.0" });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
