import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "./app.js";

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

test("UC06, UC07 and UC08 representative routes are registered", async (t) => {
  const app = await buildApp();
  t.after(() => app.close());
  const id = "00000000-0000-0000-0000-000000000000";
  const urls = [
    `/courses/${id}/lab-sets`,
    `/courses/${id}/practice/tags`,
    `/labs/${id}/discussions`,
  ];

  for (const url of urls) {
    const response = await app.inject({ method: "GET", url });
    assert.equal(response.statusCode, 401, `${url} should reach auth guard instead of returning 404`);
  }
});
