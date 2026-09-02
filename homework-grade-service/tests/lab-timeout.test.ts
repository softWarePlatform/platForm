import assert from "node:assert/strict";
import test from "node:test";
import { fetchLabGradebook } from "../src/lib/lab-client.js";
import { loopbackUrl, raceTimeout, raceTimeoutFallback } from "../src/lib/timeout.js";

test("超时后必须清掉定时器，成功路径不会在稍后抛未处理 rejection", async () => {
  const value = await raceTimeout(Promise.resolve("ok"), 50, "should-not-fire");
  assert.equal(value, "ok");
  await new Promise((resolve) => setTimeout(resolve, 80));
});

test("挂起的 Promise 在时限内回落到 fallback，而不是一直等", async () => {
  const started = Date.now();
  const value = await raceTimeoutFallback(new Promise<string>(() => undefined), 50, "fallback");
  assert.equal(value, "fallback");
  assert.ok(Date.now() - started < 200);
});

test("localhost 下游改走 IPv4，避免 Windows 上 ::1 连接挂起", () => {
  assert.equal(loopbackUrl("http://localhost:3003/internal/x"), "http://127.0.0.1:3003/internal/x");
});

test("Lab 未启动时快速返回 UNAVAILABLE，不当 0、不拖过 1 秒", async () => {
  const started = Date.now();
  const lab = await fetchLabGradebook("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
  const elapsed = Date.now() - started;
  assert.equal(lab.labStatus, "UNAVAILABLE");
  assert.equal(lab.labAverage, null);
  assert.ok(elapsed < 1000, `elapsed ${elapsed}`);
});
