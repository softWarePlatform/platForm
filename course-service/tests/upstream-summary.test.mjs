import assert from "node:assert/strict";
import test from "node:test";
import { requestCourseSummaries } from "../dist/lib/upstream-summary.js";

test("上游摘要地址未配置时明确标记不可用", async () => {
  const result = await requestCourseSummaries("", { userId: "u", courseIds: ["c"] }, "req-1");
  assert.deepEqual(result, { status: "UNAVAILABLE", data: null, reason: "NOT_CONFIGURED" });
});

test("上游摘要成功时保留返回数据", async () => {
  const result = await requestCourseSummaries("http://summary.test", { userId: "u", courseIds: ["c"] }, "req-2", async () => new Response(JSON.stringify({ summaries: [{ courseId: "c" }] }), { status: 200 }));
  assert.equal(result.status, "OK");
  assert.equal(result.data.summaries[0].courseId, "c");
});

test("上游超时或中断时不把数据降级为零", async () => {
  const result = await requestCourseSummaries("http://summary.test", { userId: "u", courseIds: ["c"] }, "req-3", async () => {
    const error = new Error("timed out");
    error.name = "TimeoutError";
    throw error;
  });
  assert.deepEqual(result, { status: "UNAVAILABLE", data: null, reason: "TIMEOUT" });
});
