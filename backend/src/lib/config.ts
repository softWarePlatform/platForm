export const config = {
  port: Number(process.env.PORT ?? 3000),
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret-change-me",
  corsOrigin: process.env.CORS_ORIGIN ?? true,
  redisUrl: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
  judgeQueueName: "judge-submissions",
  bodyLimitBytes: Number(process.env.BODY_LIMIT_BYTES ?? 2 * 1024 * 1024),
  globalRateLimitMaxPerMinute: Number(process.env.RATE_LIMIT_MAX ?? 600),
};
