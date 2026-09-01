import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { config } from "./lib/config.js";
import gradesRoutes from "./routes/grades.js";
import healthRoutes from "./routes/health.js";
import homeworkRoutes from "./routes/homework.js";
import homeworkStudentRoutes from "./routes/homework-student.js";
import internalRoutes from "./routes/internal.js";

async function main() {
  const app = Fastify({ logger: true, requestIdHeader: "x-request-id", requestIdLogLabel: "requestId" });
  app.addHook("onRequest", async (request, reply) => {
    reply.header("X-Request-ID", request.id);
  });
  await app.register(cors, { origin: config.corsOrigins, credentials: true });
  await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } });
  await app.register(healthRoutes);
  await app.register(homeworkRoutes);
  await app.register(homeworkStudentRoutes);
  await app.register(gradesRoutes);
  await app.register(internalRoutes);
  await app.listen({ port: config.port, host: "0.0.0.0" });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
