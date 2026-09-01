import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "bullmq";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
loadEnv({ path: resolve(__dirname, "../../backend/.env") });
loadEnv({ path: resolve(__dirname, "../.env") });
import { Redis } from "ioredis";
import { PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { normalizeOutput, runCode, type RunnerLanguage } from "./runner.js";
import { parseRunnerLanguage } from "./judge-language.js";
import {
  JudgeInfrastructureError,
  infrastructureFailurePayload,
  retryAttemptsExhausted,
} from "./judge-errors.js";

/** 与 backend 默认目录一致；worker 的 cwd 是 judge-worker，不能再用 process.cwd()/uploads */
const UPLOAD_ROOT =
  process.env.UPLOAD_DIR ?? join(resolve(__dirname, "../../backend/uploads"));

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
});

const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
const queueName = process.env.JUDGE_QUEUE_NAME?.trim() || "judge-submissions";
const defaultTimeout = Number(process.env.JUDGE_TIMEOUT_MS ?? 8000);

const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

const worker = new Worker(
  queueName,
  async (job) => {
    const submissionId = job.data.submissionId as string;

    const claimed = await prisma.submission.updateMany({
      where: { id: submissionId, status: { in: ["PENDING", "JUDGING"] } },
      data: { status: "JUDGING" },
    });
    // 重复任务或已处于业务终态的提交无需再次执行。
    if (claimed.count === 0) return;

    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        lab: {
          include: {
            testCases: true,
          },
        },
      },
    });

    if (!submission) return;

    let code = submission.code;
    const runLang = submission.language ?? submission.lab.language;
    if (submission.submissionKind === "FILE" && submission.fileStoredPath) {
      const abs = join(UPLOAD_ROOT, ...submission.fileStoredPath.split("/").filter(Boolean));
      try {
        code = await readFile(abs, "utf8");
      } catch (error) {
        throw new JudgeInfrastructureError("提交文件无法读取", { cause: error });
      }
    }

    const lang: RunnerLanguage | null = parseRunnerLanguage(runLang);
    if (!lang) {
      await prisma.submission.update({
        where: { id: submissionId },
        data: {
          status: "ERROR",
          score: 0,
          resultJson: JSON.stringify({
            error: "不支持的评测语言",
            language: runLang,
          }),
        },
      });
      return;
    }
    const testCases = [...submission.lab.testCases].sort((a, b) => a.id.localeCompare(b.id));

    if (testCases.length === 0) {
      await prisma.submission.update({
        where: { id: submissionId },
        data: {
          status: "ACCEPTED",
          score: 100,
          resultJson: JSON.stringify({ details: [], note: "教师尚未配置评测用例，默认满分。" }),
        },
      });
      return;
    }

    const totalWeight = testCases.reduce((s, t) => s + t.weight, 0) || 1;

    let passedWeight = 0;
    const details: Array<Record<string, unknown>> = [];

    try {
      for (const tc of testCases) {
        const run = await runCode({
          language: lang,
          code,
          stdin: tc.input.endsWith("\n") ? tc.input : `${tc.input}\n`,
          timeoutMs: defaultTimeout,
        });

        if (run.spawnError) {
          throw new JudgeInfrastructureError("评测运行器无法启动");
        }

        if (run.timedOut || run.exitCode === null) {
          await prisma.submission.update({
            where: { id: submissionId },
            data: {
              status: "TIMEOUT",
              score: (passedWeight / totalWeight) * 100,
              resultJson: JSON.stringify({
                details,
                last: { testCaseId: tc.id, error: "timeout" },
              }),
            },
          });
          return;
        }

        if (run.exitCode !== 0) {
          await prisma.submission.update({
            where: { id: submissionId },
            data: {
              status: "ERROR",
              score: (passedWeight / totalWeight) * 100,
              resultJson: JSON.stringify({
                details,
                last: {
                  testCaseId: tc.id,
                  exitCode: run.exitCode,
                  stderr: run.stderr.slice(0, 4000),
                },
              }),
            },
          });
          return;
        }

        const pass = normalizeOutput(run.stdout) === normalizeOutput(tc.expected);
        if (pass) passedWeight += tc.weight;

        const base = {
          testCaseId: tc.id,
          pass,
        };
        if (tc.hidden) {
          details.push({ ...base, hidden: true });
        } else {
          details.push({
            ...base,
            hidden: false,
            input: tc.input,
            expected: tc.expected,
            got: run.stdout,
          });
        }
      }

      const score = (passedWeight / totalWeight) * 100;
      const allPass = details.length > 0 && details.every((d) => d.pass === true);

      await prisma.submission.update({
        where: { id: submissionId },
        data: {
          status: allPass ? "ACCEPTED" : "WRONG_ANSWER",
          score,
          resultJson: JSON.stringify({ details }),
        },
      });
    } catch (error) {
      if (error instanceof JudgeInfrastructureError) throw error;
      throw new JudgeInfrastructureError("评测执行过程异常", { cause: error });
    }
  },
  { connection, concurrency: 4 },
);

worker.on("failed", (job, error) => {
  console.error("Job failed", job?.id, error);
  if (!job) return;

  const maxAttempts = job.opts.attempts ?? 1;
  if (!retryAttemptsExhausted(job.attemptsMade, maxAttempts)) return;

  const submissionId = job.data.submissionId as string | undefined;
  if (!submissionId) return;

  void prisma.submission
    .updateMany({
      where: { id: submissionId, status: { in: ["PENDING", "JUDGING"] } },
      data: {
        status: "ERROR",
        score: 0,
        resultJson: JSON.stringify(infrastructureFailurePayload(error, job.attemptsMade)),
      },
    })
    .catch((updateError) => {
      console.error("Unable to persist exhausted judge failure", submissionId, updateError);
    });
});

console.log(`Judge worker listening on ${queueName}`);
