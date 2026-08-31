import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./lib/config.js";
import coursesRoutes from "./routes/courses.js";
import healthRoutes from "./routes/health.js";

async function main() {
  const app = Fastify({ logger: true, requestIdHeader: "x-request-id", requestIdLogLabel: "requestId" });
  await app.register(cors, { origin: config.corsOrigins, credentials: true });
  await app.register(healthRoutes);
  await app.register(coursesRoutes);

  await app.listen({ port: config.port, host: "0.0.0.0" });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
