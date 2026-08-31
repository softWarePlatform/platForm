import assert from "node:assert/strict";
import test from "node:test";
import { courseServiceRouteOwnership } from "../src/route-ownership.js";

test("课程服务登记全部公开路由族，Dashboard 标记为等待远程汇总", () => {
  assert.deepEqual(
    courseServiceRouteOwnership.map((route) => route.path),
    [
      "/api/auth/**",
      "/api/courses/**",
      "/api/enrollment/**",
      "/api/announcements/**",
      "/api/materials/**",
      "/api/notifications/**",
      "/api/admin/**",
      "/api/dashboard/**",
    ],
  );
  assert.equal(
    courseServiceRouteOwnership.find((route) => route.path === "/api/dashboard/**")?.status,
    "blocked-by-remote-summary",
  );
});
