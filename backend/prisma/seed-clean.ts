import type { PrismaClient } from "@prisma/client";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

/** 清空 public 下所有业务表（保留 _prisma_migrations） */
export async function cleanDatabase(prisma: PrismaClient) {
  const rows = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  `;
  const tables = rows
    .map((r) => r.tablename)
    .filter((t) => t !== "_prisma_migrations");

  if (tables.length > 0) {
    const sql = `TRUNCATE TABLE ${tables.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE;`;
    await prisma.$executeRawUnsafe(sql);
  }
}

/** 清理演示上传目录，避免旧文件残留 */
export async function cleanUploadDirs(uploadRoot: string) {
  for (const dir of ["courses", "labs", "submissions", "homework"]) {
    await rm(join(uploadRoot, dir), { recursive: true, force: true });
    await mkdir(join(uploadRoot, dir), { recursive: true });
  }
}
