/**
 * 演示数据库种子：清空业务数据 → 写入大规模演示集。
 * 运行：cd backend && npm run db:seed
 */
import { PrismaClient } from "@prisma/client";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanDatabase, cleanUploadDirs } from "./seed-clean.js";
import { DEMO_PASSWORD, seedDemoBulk } from "./seed-demo-bulk.js";

const prisma = new PrismaClient();
const UPLOAD_ROOT = join(process.cwd(), "uploads");

async function ensureFile(rel: string, content: string) {
  const abs = join(UPLOAD_ROOT, ...rel.split("/").filter(Boolean));
  await mkdir(join(abs, ".."), { recursive: true });
  await writeFile(abs, content, "utf8");
}

async function main() {
  console.log("正在清空数据库与演示上传文件…");
  await cleanDatabase(prisma);
  await cleanUploadDirs(UPLOAD_ROOT);

  console.log("正在写入演示数据（12 门课 / 5 教师 / 20 学生）…");
  await seedDemoBulk(prisma, { uploadRoot: UPLOAD_ROOT, ensureFile });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

export { DEMO_PASSWORD };
