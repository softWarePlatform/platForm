/** OpenAI 兼容（DeepSeek 等）：未配置 API Key 时 AI 路由使用本地模板降级 */
const openaiApiKey = (process.env.OPENAI_API_KEY ?? process.env.DEEPSEEK_API_KEY ?? "").trim();

export const config = {
  port: Number(process.env.PORT ?? 3000),
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret-change-me",
  corsOrigin: process.env.CORS_ORIGIN ?? true,
  redisUrl: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
  judgeQueueName: "judge-submissions",
  bodyLimitBytes: Number(process.env.BODY_LIMIT_BYTES ?? 2 * 1024 * 1024),
  globalRateLimitMaxPerMinute: Number(process.env.RATE_LIMIT_MAX ?? 600),

  openaiApiKey,
  /** 不含尾斜杠；无 /v1 时自动补全，例如 https://api.deepseek.com */
  openaiBaseUrl: (process.env.OPENAI_BASE_URL ?? "https://api.deepseek.com").trim(),
  openaiModel: (process.env.OPENAI_MODEL ?? "deepseek-v4-flash").trim(),
  aiTimeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 60_000),
  aiMaxTokens: Number(process.env.AI_MAX_TOKENS ?? 2048),
  /** 本路由独立限流（每分钟每 IP） */
  aiRouteRateLimitMaxPerMinute: Number(process.env.AI_RATE_LIMIT_MAX ?? 20),
};
