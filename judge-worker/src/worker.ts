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

/** 与 backend 默认目录一致；worker 的 cwd 是 judge-worker，不能再用 process.cwd()/uploads */
const UPLOAD_ROOT =
  process.env.UPLOAD_DIR ?? join(resolve(__dirname, "../../backend/uploads"));

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
});

const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
const queueName = "judge-submissions";
const defaultTimeout = Number(process.env.JUDGE_TIMEOUT_MS ?? 8000);

const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

function mapLanguage(dbLang: string): RunnerLanguage {
  if (dbLang === "python") return "python";
  return "javascript";
}

const worker = new Worker(
  queueName,
  async (job) => {
    const submissionId = job.data.submissionId as string;

    await prisma.submission.updateMany({
      where: { id: submissionId },
      data: { status: "JUDGING" },
    });

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

    if (submission.status === "PENDING_REVIEW") return;

    let code = submission.code;
    const runLang = submission.language ?? submission.lab.language;
    if (submission.submissionKind === "FILE" && submission.fileStoredPath) {
      const abs = join(UPLOAD_ROOT, ...submission.fileStoredPath.split("/").filter(Boolean));
      try {
        code = await readFile(abs, "utf8");
      } catch {
        await prisma.submission.update({
          where: { id: submissionId },
          data: {
            status: "ERROR",
            resultJson: JSON.stringify({ error: "提交文件无法读取" }),
          },
        });
        return;
      }
    }

    const lang = mapLanguage(runLang);
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
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await prisma.submission.update({
        where: { id: submissionId },
        data: {
          status: "ERROR",
          resultJson: JSON.stringify({ error: message.slice(0, 4000) }),
        },
      });
    }
  },
  { connection, concurrency: 4 },
);

worker.on("failed", (job, err) => {
  console.error("Job failed", job?.id, err);
});

console.log(`Judge worker listening on ${queueName}`);
