import assert from "node:assert/strict";
import test from "node:test";
import { classifyApiPath, downstreamPath } from "../src/routing.js";

test("作业路径打到 homework，且优先于 /api/courses 通配", () => {
  assert.equal(classifyApiPath("/api/homework"), "homework");
  assert.equal(classifyApiPath("/api/homework/abc/submit"), "homework");
  assert.equal(classifyApiPath("/api/grades/me"), "homework");
  assert.equal(classifyApiPath("/api/courses/11111111-1111-1111-1111-111111111111/homework"), "homework");
  assert.equal(classifyApiPath("/api/courses/11111111-1111-1111-1111-111111111111/homework/x"), "homework");
  assert.equal(classifyApiPath("/api/courses/11111111-1111-1111-1111-111111111111/grading-config"), "homework");
  assert.equal(classifyApiPath("/api/courses/11111111-1111-1111-1111-111111111111/gradebook"), "homework");
});

test("课程路径打到 course", () => {
  assert.equal(classifyApiPath("/api/auth/login"), "course");
  assert.equal(classifyApiPath("/api/courses"), "course");
  assert.equal(classifyApiPath("/api/courses/11111111-1111-1111-1111-111111111111"), "course");
  assert.equal(classifyApiPath("/api/enrollment/catalog"), "course");
  assert.equal(classifyApiPath("/api/admin/users"), "course");
});

test("实验练习路径打到 lab，其余 /api 回退单体，internal 不转发", () => {
  assert.equal(classifyApiPath("/api/labs/x"), "lab");
  assert.equal(classifyApiPath("/api/wrong-book/mine"), "lab");
  assert.equal(classifyApiPath("/api/practice/sessions"), "lab");
  assert.equal(classifyApiPath("/api/unknown"), "monolith");
  assert.equal(classifyApiPath("/internal/users/1"), "none");
});

test("去掉 /api 前缀后再转给下游", () => {
  assert.equal(downstreamPath("/api/homework/a"), "/homework/a");
  assert.equal(downstreamPath("/api/auth/login"), "/auth/login");
});
