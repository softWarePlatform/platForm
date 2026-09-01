import assert from "node:assert/strict";

const gateway = (process.env.GATEWAY_URL ?? "http://127.0.0.1:3081").replace(/\/$/, "");

async function call(path, options = {}) {
  const response = await fetch(`${gateway}${path}`, options);
  const type = response.headers.get("content-type") ?? "";
  const body = type.includes("application/json") ? await response.json() : await response.arrayBuffer();
  return { status: response.status, headers: response.headers, body };
}

const live = await call("/health/live");
assert.equal(live.status, 200);
assert.equal(live.body.service, "api-gateway");
assert.ok(live.headers.get("x-request-id"));

const login = await call("/api/auth/login", {
  method: "POST",
  headers: { "content-type": "application/json", "x-request-id": "gw-smoke-1" },
  body: JSON.stringify({ email: "teacher@course.local", password: "Course123456" }),
});
assert.equal(login.status, 200, JSON.stringify(login.body));
assert.equal(login.headers.get("x-request-id"), "gw-smoke-1");
assert.ok(login.body.token);

const teaching = await call("/api/homework/teaching", {
  headers: { authorization: `Bearer ${login.body.token}` },
});
assert.equal(teaching.status, 200, JSON.stringify(teaching.body));
assert.ok(Array.isArray(teaching.body.homeworks));

const studentLogin = await call("/api/auth/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "student@course.local", password: "Course123456" }),
});
assert.equal(studentLogin.status, 200);

const denied = await call("/api/homework/teaching", {
  headers: { authorization: `Bearer ${studentLogin.body.token}` },
});
assert.equal(denied.status, 403);

const catalog = await call("/api/enrollment/catalog", {
  headers: { authorization: `Bearer ${studentLogin.body.token}` },
});
assert.equal(catalog.status, 200);

const courses = await call("/api/courses", { headers: { authorization: `Bearer ${login.body.token}` } });
assert.equal(courses.status, 200);

const labDown = await call("/api/labs");
assert.equal(labDown.status, 502, JSON.stringify(labDown.body));
assert.equal(labDown.body.code, "BAD_GATEWAY");
assert.ok(labDown.body.requestId);

const preflight = await fetch(`${gateway}/api/auth/login`, {
  method: "OPTIONS",
  headers: { origin: "http://localhost:5173", "access-control-request-method": "POST" },
});
assert.equal(preflight.status, 204);
assert.equal(preflight.headers.get("access-control-allow-origin"), "http://localhost:5173");
assert.ok(preflight.headers.get("x-request-id"));

console.log("api-gateway smoke passed");
