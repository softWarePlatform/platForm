export class JudgeInfrastructureError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "JudgeInfrastructureError";
  }
}

export function infrastructureFailurePayload(error: unknown, attempts: number) {
  const reason =
    error instanceof JudgeInfrastructureError ? error.message : "评测服务暂时不可用";
  return {
    error: "评测基础设施故障，重试后仍未恢复",
    reason,
    attempts,
    retryExhausted: true,
  };
}

export function retryAttemptsExhausted(attemptsMade: number, maxAttempts: number): boolean {
  return attemptsMade >= maxAttempts;
}
