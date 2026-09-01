import assert from "node:assert/strict";
import test from "node:test";
import { homeworkServiceRouteOwnership } from "../src/route-ownership.js";

test("作业服务登记公开路由族，错题本标记转发到 Lab", () => {
  assert.deepEqual(
    homeworkServiceRouteOwnership.map((route) => route.path),
    [
      "/api/homework/**",
      "/api/courses/:courseId/homework",
      "/api/grades/**",
      "/api/courses/:courseId/grading-config",
      "/api/courses/:courseId/gradebook",
      "/api/wrong-book/**",
    ],
  );
  assert.equal(
    homeworkServiceRouteOwnership.find((route) => route.path === "/api/wrong-book/**")?.status,
    "forward-to-lab",
  );
});
