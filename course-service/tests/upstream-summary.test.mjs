import assert from "node:assert/strict";
import test from "node:test";
import { requestHomeworkSummary, requestLabGradebook } from "../dist/lib/upstream-summary.js";

test("上游摘要地址未配置时明确标记不可用", async () => {
  const result = await requestLabGradebook("", "course-1", "req-1");
  assert.deepEqual(result, { status: "UNAVAILABLE", data: null, reason: "NOT_CONFIGURED" });
});

test("实验成绩册使用 B 冻结的单课程内部路径和鉴权头", async () => {
  let requested = "";
  let headers;
  const result = await requestLabGradebook("http://lab.test", "course-1", "req-2", async (url, init) => {
    requested = url;
    headers = init.headers;
    return new Response(JSON.stringify({ courseId: "course-1", labStatus: "OK", labAverage: null, students: [] }), { status: 200 });
  });
  assert.equal(requested, "http://lab.test/internal/courses/course-1/lab-gradebook");
  assert.equal(headers["x-internal-service-token"], "course-service-internal-local-token");
  assert.equal(headers["x-request-id"], "req-2");
  assert.equal(result.status, "OK");
  assert.equal(result.data.courseId, "course-1");
});

test("上游超时或中断时不把数据降级为零", async () => {
  const result = await requestLabGradebook("http://lab.test", "course-1", "req-3", async () => {
    const error = new Error("timed out");
    error.name = "TimeoutError";
    throw error;
  });
  assert.deepEqual(result, { status: "UNAVAILABLE", data: null, reason: "TIMEOUT" });
});

test("作业摘要使用 C 已实现的单课程内部路径", async () => {
  let requested = "";
  const result = await requestHomeworkSummary("http://homework.test", "course-1", "req-4", async (url) => {
    requested = url;
    return new Response(JSON.stringify({ courseId: "course-1", homeworkCount: 2 }), { status: 200 });
  });
  assert.equal(requested, "http://homework.test/internal/courses/course-1/homework-summary");
  assert.equal(result.status, "OK");
  assert.equal(result.data.homeworkCount, 2);
});
