import "dotenv/config";

export const labConfig = {
  port: Number(process.env.PORT ?? 3003),
  internalServiceToken:
    process.env.INTERNAL_SERVICE_TOKEN ?? "course-service-internal-local-token",
  courseServiceUrl: (process.env.COURSE_SERVICE_URL ?? "http://127.0.0.1:3001").replace(/\/$/, ""),
};
