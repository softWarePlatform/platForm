/**
 * judge-worker 专用 Prisma Client（generator judge_worker）。
 * 已有 Client 时默认跳过 generate；--force 时尝试先 stop:worker 再生成。
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const workerClient = join(root, "node_modules", ".prisma", "client");
const engineDll = join(workerClient, "query_engine-windows.dll.node");
const engineSo = join(workerClient, "libquery_engine-darwin.dylib.node");
const hasClient =
  existsSync(engineDll) || existsSync(engineSo) || existsSync(join(workerClient, "index.js"));

const force =
  process.env.PRISMA_GENERATE_FORCE === "1" ||
  process.argv.includes("--force");

if (hasClient && !force) {
  console.log(
    "[judge-worker] Prisma Client 已存在，跳过 generate。" +
      "若刚 migrate，请: npm run stop:worker && npm run db:generate",
  );
  process.exit(0);
}

const result = spawnSync(
  "npx",
  [
    "prisma",
    "generate",
    "--schema=../backend/prisma/schema.prisma",
    "--generator",
    "judge_worker",
  ],
  { cwd: root, stdio: "inherit", shell: true },
);

if (result.status === 0) {
  process.exit(0);
}

if (hasClient) {
  console.warn(
    "\n[judge-worker] prisma generate 未成功（多为 query_engine DLL 被占用 / EPERM）。" +
      "当前已有 Prisma Client，可直接 npm run dev 启动 worker。\n" +
      "若必须重建：关闭所有 npm run dev / dev:full / dev:worker 窗口后，再执行 npm run db:generate\n",
  );
  process.exit(0);
}

console.error(
  "\n[judge-worker] 未生成 Prisma Client。\n" +
    "1) 关闭占用进程: npm run stop:worker\n" +
    "2) 再执行: npm run db:generate\n" +
    "3) 仍失败可暂时关闭杀毒实时扫描后重试\n",
);
process.exit(result.status ?? 1);
