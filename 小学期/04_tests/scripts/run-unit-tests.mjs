// 进程内运行编译后的单元测试（node:test isolation:'none'，不派生子进程）
// 先编译：node backend/node_modules/typescript/bin/tsc -p backend/tsconfig.tests.json
// 再运行：node scripts/run-unit-tests.mjs "backend/.test-build/tests/unit/*.test.js"
import { run } from "node:test";
import { spec } from "node:test/reporters";
import { globSync } from "node:fs";
import process from "node:process";

const patterns = process.argv.slice(2);
if (patterns.length === 0) {
  console.error("用法: node scripts/run-unit-tests.mjs <glob 模式...>");
  process.exit(2);
}
const files = patterns.flatMap((p) => globSync(p)).filter((f) => f.endsWith(".test.js"));
if (files.length === 0) {
  console.error("没有匹配到任何 .test.js 文件:", patterns.join(", "));
  process.exit(2);
}

let failed = 0;
const stream = run({ files, isolation: "none", concurrency: false });
stream.on("test:fail", () => {
  failed += 1;
});
stream.on("end", () => {
  process.exitCode = failed > 0 ? 1 : 0;
});
stream.pipe(new spec()).pipe(process.stdout);
