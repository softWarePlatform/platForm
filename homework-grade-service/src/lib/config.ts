import "dotenv/config";

const corsOrigin = process.env.CORS_ORIGIN ?? "http://localhost:5173,http://localhost:8080";

export const config = {
  port: Number(process.env.PORT ?? 3002),
  corsOrigins: corsOrigin.split(",").map((origin) => origin.trim()).filter(Boolean),
  jwtSecret: process.env.JWT_SECRET ?? "course-service-local-secret-change-me",
  internalServiceToken: process.env.INTERNAL_SERVICE_TOKEN ?? "course-service-internal-local-token",
  courseServiceUrl: (process.env.COURSE_SERVICE_URL ?? "http://localhost:3001").replace(/\/$/, ""),
  labServiceUrl: (process.env.LAB_SERVICE_URL ?? "http://localhost:3003").replace(/\/$/, ""),
  uploadDir: process.env.UPLOAD_DIR ?? "./uploads",
};
