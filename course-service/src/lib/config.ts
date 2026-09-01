const corsOrigin = process.env.CORS_ORIGIN ?? "http://localhost:5173,http://localhost:8080";

export const config = {
  port: Number(process.env.PORT ?? 3001),
  corsOrigins: corsOrigin.split(",").map((origin) => origin.trim()).filter(Boolean),
  jwtSecret: process.env.JWT_SECRET ?? "course-service-local-secret-change-me",
  internalServiceToken: process.env.INTERNAL_SERVICE_TOKEN ?? "course-service-internal-local-token",
  uploadDir: process.env.UPLOAD_DIR ?? "./uploads",
  homeworkServiceUrl: process.env.HOMEWORK_SERVICE_URL?.replace(/\/$/, "") ?? "",
  labServiceUrl: process.env.LAB_SERVICE_URL?.replace(/\/$/, "") ?? "",
  upstreamTimeoutMs: Number(process.env.UPSTREAM_TIMEOUT_MS ?? 2000),
};
