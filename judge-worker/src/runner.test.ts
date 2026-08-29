import assert from "node:assert/strict";
import { normalizeOutput, runCode } from "./runner.js";

assert.equal(normalizeOutput("Hello\r\n"), "Hello");
assert.equal(normalizeOutput("Hello\n"), "Hello");
assert.equal(normalizeOutput("Hello  \n\n"), "Hello");
assert.equal(normalizeOutput(""), "");

const run = await runCode({
  language: "javascript",
  code: 'console.log("Hello")\n',
  stdin: "",
  timeoutMs: 4000,
});
assert.equal(run.timedOut, false);
assert.equal(normalizeOutput(run.stdout), "Hello");
assert.equal(run.exitCode, 0);

console.log("runner.test.ts: ok");
