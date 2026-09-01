import "dotenv/config";

const corsOrigin = process.env.CORS_ORIGIN ?? "http://localhost:5173,http://localhost:8080";

export const config = {
  port: Number(process.env.PORT ?? 3081),
  corsOrigins: corsOrigin.split(",").map((origin) => origin.trim()).filter(Boolean),
  courseServiceUrl: (process.env.COURSE_SERVICE_URL ?? "http://127.0.0.1:3001").replace(/\/$/, ""),
  homeworkServiceUrl: (process.env.HOMEWORK_SERVICE_URL ?? "http://127.0.0.1:3002").replace(/\/$/, ""),
  labServiceUrl: (process.env.LAB_SERVICE_URL ?? "http://127.0.0.1:3003").replace(/\/$/, ""),
  monolithUrl: (process.env.MONOLITH_URL ?? "http://127.0.0.1:3000").replace(/\/$/, ""),
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX ?? 300),
};
