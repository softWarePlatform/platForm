import "dotenv/config";

const openaiApiKey = (process.env.OPENAI_API_KEY ?? process.env.DEEPSEEK_API_KEY ?? "").trim();

export const labConfig = {
  port: Number(process.env.PORT ?? 3003),
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret-change-me",
  corsOrigin: process.env.CORS_ORIGIN ?? true,
  redisUrl: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
  judgeQueueName: process.env.JUDGE_QUEUE_NAME?.trim() || "judge-submissions",
  bodyLimitBytes: Number(process.env.BODY_LIMIT_BYTES ?? 2 * 1024 * 1024),
  globalRateLimitMaxPerMinute: Number(process.env.RATE_LIMIT_MAX ?? 600),
  openaiApiKey,
  openaiBaseUrl: (process.env.OPENAI_BASE_URL ?? "https://api.deepseek.com").trim(),
  openaiModel: (process.env.OPENAI_MODEL ?? "deepseek-v4-flash").trim(),
  aiTimeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 60_000),
  aiMaxTokens: Number(process.env.AI_MAX_TOKENS ?? 2048),
  aiRouteRateLimitMaxPerMinute: Number(process.env.AI_RATE_LIMIT_MAX ?? 20),
  internalServiceToken:
    process.env.INTERNAL_SERVICE_TOKEN ?? "course-service-internal-local-token",
  courseServiceUrl: (process.env.COURSE_SERVICE_URL ?? "http://127.0.0.1:3001").replace(/\/$/, ""),
};
