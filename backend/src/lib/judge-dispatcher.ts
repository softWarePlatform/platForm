import type { Submission } from "@prisma/client";
import { prisma } from "./prisma.js";
import { getJudgeQueue } from "./queue.js";

const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_INTERVAL_MS = 15_000;
const PENDING_MIN_AGE_MS = 10_000;
const ENQUEUE_TIMEOUT_MS = 2_000;

type PendingSubmission = Pick<Submission, "id">;

export type JudgeDispatcherDependencies = {
  listPending: (limit: number, createdBefore: Date) => Promise<PendingSubmission[]>;
  addJob: (submissionId: string) => Promise<unknown>;
};

export type JudgeDispatchResult = {
  examined: number;
  queued: number;
  failed: number;
};

const runtimeDependencies: JudgeDispatcherDependencies = {
  listPending: (limit, createdBefore) =>
    prisma.submission.findMany({
      where: {
        status: "PENDING",
        createdAt: { lte: createdBefore },
      },
      orderBy: { createdAt: "asc" },
      take: limit,
      select: { id: true },
    }),
  addJob: (submissionId) =>
    getJudgeQueue().add("judge", { submissionId }, { jobId: submissionId }),
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`Redis enqueue timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * 尝试立即入队。失败不会让已经持久化的 Submission 请求返回 500；
 * PENDING 补偿扫描会在 Redis 恢复后使用相同 jobId 重试。
 */
export async function tryEnqueueJudgeSubmission(
  submissionId: string,
  dependencies: JudgeDispatcherDependencies = runtimeDependencies,
  timeoutMs = ENQUEUE_TIMEOUT_MS,
): Promise<boolean> {
  try {
    await withTimeout(dependencies.addJob(submissionId), timeoutMs);
    return true;
  } catch (error) {
    console.error(`Judge enqueue deferred for submission ${submissionId}: ${errorMessage(error)}`);
    return false;
  }
}

export async function dispatchPendingJudgeSubmissions(
  dependencies: JudgeDispatcherDependencies = runtimeDependencies,
  options: { limit?: number; now?: Date; minAgeMs?: number } = {},
): Promise<JudgeDispatchResult> {
  const limit = options.limit ?? DEFAULT_BATCH_SIZE;
  const now = options.now ?? new Date();
  const createdBefore = new Date(now.getTime() - (options.minAgeMs ?? PENDING_MIN_AGE_MS));
  const pending = await dependencies.listPending(limit, createdBefore);
  let queued = 0;
  let failed = 0;

  for (const submission of pending) {
    if (await tryEnqueueJudgeSubmission(submission.id, dependencies)) queued += 1;
    else failed += 1;
  }

  return { examined: pending.length, queued, failed };
}

export function startJudgeDispatcher(options: {
  intervalMs?: number;
  onResult?: (result: JudgeDispatchResult) => void;
  onError?: (error: unknown) => void;
} = {}): () => void {
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  let running = false;

  const dispatch = async () => {
    if (running) return;
    running = true;
    try {
      const result = await dispatchPendingJudgeSubmissions();
      if (result.examined > 0) options.onResult?.(result);
    } catch (error) {
      options.onError?.(error);
    } finally {
      running = false;
    }
  };

  void dispatch();
  const timer = setInterval(() => void dispatch(), intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
