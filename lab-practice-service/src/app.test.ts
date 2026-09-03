import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "./app.js";
import { signToken } from "./lib/jwt.js";

test("health/live identifies the independent service", async (t) => {
  const app = await buildApp();
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/health/live" });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    ok: true,
    service: "lab-practice-service",
    type: "live",
  });
});

test("migrated lab-sets maps Course failures to a stable 503", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => Response.json({ code: "DOWN" }, { status: 503 })) as typeof fetch;
  const app = await buildApp();
  t.after(async () => {
    globalThis.fetch = originalFetch;
    await app.close();
  });
  const token = signToken({ sub: "00000000-0000-4000-8000-000000000001", email: "student@example.com", role: "STUDENT" });
  const response = await app.inject({
    method: "GET",
    url: "/courses/00000000-0000-4000-8000-000000000002/lab-sets",
    headers: { authorization: `Bearer ${token}`, "x-request-id": "lab-course-down" },
  });
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.json(), {
    code: "COURSE_UNAVAILABLE",
    message: "课程服务暂时不可用",
    requestId: "lab-course-down",
  });
});

test("UC06, UC07 and UC08 representative routes are registered", async (t) => {
  const app = await buildApp();
  t.after(() => app.close());
  const id = "00000000-0000-0000-0000-000000000000";
  const urls = [
    `/courses/${id}/lab-sets`,
    `/courses/${id}/labs`,
    `/labs/${id}`,
    `/labs/${id}/files`,
    `/lab-sets/mine/overview`,
    `/courses/${id}/practice/tags`,
    `/labs/${id}/discussions`,
  ];

  for (const url of urls) {
    const response = await app.inject({ method: "GET", url });
    assert.equal(response.statusCode, 401, `${url} should reach auth guard instead of returning 404`);
  }
});
