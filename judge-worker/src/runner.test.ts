import assert from "node:assert/strict";
import { normalizeOutput, runCode } from "./runner.js";
import { parseRunnerLanguage } from "./judge-language.js";
import {
  JudgeInfrastructureError,
  infrastructureFailurePayload,
  retryAttemptsExhausted,
} from "./judge-errors.js";

assert.equal(normalizeOutput("Hello\r\n"), "Hello");
assert.equal(normalizeOutput("Hello\n"), "Hello");
assert.equal(normalizeOutput("Hello  \n\n"), "Hello");
assert.equal(normalizeOutput(""), "");
assert.equal(parseRunnerLanguage("python"), "python");
assert.equal(parseRunnerLanguage(" JAVASCRIPT "), "javascript");
assert.equal(parseRunnerLanguage("java"), null);
assert.equal(parseRunnerLanguage("cpp"), null);

const failure = infrastructureFailurePayload(
  new JudgeInfrastructureError("提交文件无法读取"),
  2,
);
assert.deepEqual(failure, {
  error: "评测基础设施故障，重试后仍未恢复",
  reason: "提交文件无法读取",
  attempts: 2,
  retryExhausted: true,
});
assert.equal(retryAttemptsExhausted(1, 2), false);
assert.equal(retryAttemptsExhausted(2, 2), true);

const run = await runCode({
  language: "javascript",
  code: 'console.log("Hello")\n',
  stdin: "",
  timeoutMs: 4000,
});
assert.equal(run.timedOut, false);
assert.equal(normalizeOutput(run.stdout), "Hello");
assert.equal(run.exitCode, 0);
assert.equal(run.spawnError, null);

console.log("runner.test.ts: ok");
