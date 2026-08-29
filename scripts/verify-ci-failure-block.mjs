import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const resultPath = resolve("test-results/ci-failure-blocking.json");
const markerPath = resolve("test-results/downstream-stage.marker");
await mkdir(resolve("test-results"), { recursive: true });
await rm(markerPath, { force: true });

const stages = [
  { name: "unit", command: [process.execPath, ["-e", "process.exit(0)"]] },
  { name: "injected-failure", command: [process.execPath, ["-e", "process.exit(17)"]] },
  { name: "downstream-image-build", command: [process.execPath, ["-e", `require('node:fs').writeFileSync(${JSON.stringify(markerPath)}, 'must-not-run')`]] },
];
const executed = [];
let blockedAt = null;
for (const stage of stages) {
  const child = spawnSync(stage.command[0], stage.command[1], { stdio: "pipe" });
  executed.push({ name: stage.name, exitCode: child.status });
  if (child.status !== 0) {
    blockedAt = stage.name;
    break;
  }
}

const downstreamExecuted = executed.some((item) => item.name === "downstream-image-build");
const report = {
  generatedAt: new Date().toISOString(),
  policy: "Sequential CI stages stop at the first non-zero exit code; jobs depending on quality cannot start.",
  injectedExitCode: 17,
  blockedAt,
  downstreamExecuted,
  pipelineBlocked: blockedAt === "injected-failure" && downstreamExecuted === false,
  executed,
};
assert.equal(report.pipelineBlocked, true);
await writeFile(resultPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
