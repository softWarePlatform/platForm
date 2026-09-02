import assert from "node:assert/strict";

process.env.NO_PROXY = [process.env.NO_PROXY, "127.0.0.1", "localhost", "::1"].filter(Boolean).join(",");

const gateway = (process.env.GATEWAY_URL ?? "http://127.0.0.1:3081").replace(/\/$/, "");

async function call(path, options = {}) {
  const response = await fetch(`${gateway}${path}`, { ...options, signal: AbortSignal.timeout(20000) });
  const type = response.headers.get("content-type") ?? "";
  const body = type.includes("application/json") ? await response.json() : await response.arrayBuffer();
  return { status: response.status, headers: response.headers, body };
}

const json = (token, extra = {}) => ({ authorization: `Bearer ${token}`, "content-type": "application/json", ...extra });

const viaVite = /:5173$/.test(gateway);
if (!viaVite) {
  const live = await call("/health/live");
  assert.equal(live.status, 200);
  assert.equal(live.body.service, "api-gateway");
  assert.ok(live.headers.get("x-request-id"));
}

const login = await call("/api/auth/login", {
  method: "POST",
  headers: { "content-type": "application/json", "x-request-id": "gw-smoke-1" },
  body: JSON.stringify({ email: "teacher@course.local", password: "Course123456" }),
});
assert.equal(login.status, 200, JSON.stringify(login.body));
assert.equal(login.headers.get("x-request-id"), "gw-smoke-1");
assert.ok(login.body.token);
const teacher = login.body.token;

const teaching = await call("/api/homework/teaching", { headers: { authorization: `Bearer ${teacher}` } });
assert.equal(teaching.status, 200, JSON.stringify(teaching.body));
assert.ok(Array.isArray(teaching.body.homeworks));

const studentLogin = await call("/api/auth/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "student@course.local", password: "Course123456" }),
});
assert.equal(studentLogin.status, 200);
const student = studentLogin.body.token;

const denied = await call("/api/homework/teaching", { headers: { authorization: `Bearer ${student}` } });
assert.equal(denied.status, 403);

const catalog = await call("/api/enrollment/catalog", { headers: { authorization: `Bearer ${student}` } });
assert.equal(catalog.status, 200);
const primary = catalog.body.courses.find((course) => course.courseCode === "CS-SVC-101") ?? catalog.body.courses[0];
assert.ok(primary, "catalog must include a published course");
if (!primary.enrolled) {
  await call(`/api/enrollment/courses/${primary.id}/enroll`, {
    method: "POST",
    headers: json(student),
    body: "{}",
  });
}

const courses = await call("/api/courses", { headers: { authorization: `Bearer ${teacher}` } });
assert.equal(courses.status, 200);

const labDown = await call("/api/labs", { headers: { "x-request-id": "gw-lab-down" } });
assert.equal(labDown.status, 502, JSON.stringify(labDown.body));
assert.equal(labDown.body.code, "BAD_GATEWAY");
assert.ok(labDown.body.requestId);
assert.equal(labDown.headers.get("x-request-id"), "gw-lab-down");

const created = await call(`/api/courses/${primary.id}/homework`, {
  method: "POST",
  headers: json(teacher),
  body: JSON.stringify({ title: `网关作业冒烟 ${Date.now()}`, published: false }),
});
assert.equal(created.status, 201, JSON.stringify(created.body));
const homeworkId = created.body.homework.id;

const published = await call(`/api/homework/${homeworkId}/publish`, {
  method: "PATCH",
  headers: json(teacher),
  body: JSON.stringify({ published: true }),
});
assert.equal(published.status, 200);
assert.equal(published.body.homework.published, true);

const studentList = await call(`/api/courses/${primary.id}/homework`, { headers: { authorization: `Bearer ${student}` } });
assert.equal(studentList.status, 200);
assert.ok(studentList.body.homeworks.some((item) => item.id === homeworkId));

const submitted = await call(`/api/homework/${homeworkId}/submit`, {
  method: "POST",
  headers: json(student),
  body: JSON.stringify({ content: "网关冒烟提交" }),
});
assert.equal(submitted.status, 200, JSON.stringify(submitted.body));

const submissions = await call(`/api/homework/${homeworkId}/submissions`, { headers: { authorization: `Bearer ${teacher}` } });
assert.equal(submissions.status, 200);
const sid = submissions.body.submissions[0].id;
const graded = await call(`/api/homework/submissions/${sid}/grade`, {
  method: "PATCH",
  headers: json(teacher),
  body: JSON.stringify({ score: 88, feedback: "网关通过" }),
});
assert.equal(graded.status, 200);

const released = await call(`/api/homework/${homeworkId}/release-grades`, {
  method: "PATCH",
  headers: json(teacher),
  body: "{}",
});
assert.equal(released.status, 200);

const gradebook = await call(`/api/courses/${primary.id}/gradebook`, { headers: { authorization: `Bearer ${teacher}` } });
assert.equal(gradebook.status, 200, JSON.stringify(gradebook.body));
assert.equal(gradebook.body.labStatus, "UNAVAILABLE");
assert.ok(gradebook.body.weights.lab + gradebook.body.weights.homework === 1);
for (const row of gradebook.body.students ?? []) {
  assert.equal(row.summary.totalScore, null);
  assert.notEqual(row.summary.labAverage, 0);
}

const wrongBookRead = await call("/api/wrong-book/mine", { headers: { authorization: `Bearer ${student}` } });
assert.equal(wrongBookRead.status, 502, JSON.stringify(wrongBookRead.body));
assert.equal(wrongBookRead.body.code, "BAD_GATEWAY");
assert.ok(wrongBookRead.body.requestId);

if (!viaVite) {
  const preflight = await fetch(`${gateway}/api/auth/login`, {
    method: "OPTIONS",
    headers: { origin: "http://localhost:5173", "access-control-request-method": "POST" },
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), "http://localhost:5173");
  assert.ok(preflight.headers.get("x-request-id"));
}

console.log("api-gateway smoke passed");
if (viaVite) console.log("W2-2 via Vite /api proxy");
console.log(`W1-3 lab 502 requestId=${labDown.body.requestId} gradebook labStatus=${gradebook.body.labStatus}`);
console.log(`W1-4 homeworkId=${homeworkId}`);
