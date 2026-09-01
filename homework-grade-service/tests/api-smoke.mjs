import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const base = (process.env.API_BASE_URL ?? "http://localhost:3002").replace(/\/$/, "");
const courseBase = (process.env.COURSE_SERVICE_URL ?? "http://localhost:3001").replace(/\/$/, "");

function envFromDotenv(name, fallback) {
  if (process.env[name]) return process.env[name];
  const envPath = join(dirname(fileURLToPath(import.meta.url)), "../.env");
  if (!existsSync(envPath)) return fallback;
  const line = readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((row) => row.startsWith(`${name}=`));
  if (!line) return fallback;
  return line.slice(`${name}=`.length).trim().replace(/^["']|["']$/g, "") || fallback;
}

const internalToken = envFromDotenv("INTERNAL_SERVICE_TOKEN", "course-service-internal-local-token");

async function call(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(20000) });
  const type = response.headers.get("content-type") ?? "";
  const body = type.includes("application/json") ? await response.json() : await response.arrayBuffer();
  return { status: response.status, body };
}

const live = await call(`${base}/health/live`);
const ready = await call(`${base}/health/ready`);
assert.equal(live.status, 200);
assert.equal(ready.status, 200);
assert.equal(live.body.service, "homework-grade-service");

const unauthorized = await call(`${base}/homework/teaching`);
assert.equal(unauthorized.status, 401);

const courseLive = await call(`${courseBase}/health/live`);
if (courseLive.status !== 200) {
  console.log("course-service not running; skipped cross-service smoke");
  process.exit(0);
}

async function login(email) {
  const result = await call(`${courseBase}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "Course123456" }),
  });
  assert.equal(result.status, 200, `${email} should log in on course-service`);
  return result.body.token;
}

const json = (token, extra = {}) => ({ authorization: `Bearer ${token}`, "content-type": "application/json", ...extra });

const teacher = await login("teacher@course.local");
const student = await login("student@course.local");

const catalog = await call(`${courseBase}/enrollment/catalog`, { headers: { authorization: `Bearer ${student}` } });
assert.equal(catalog.status, 200);
const primary = catalog.body.courses.find((course) => course.courseCode === "CS-SVC-101") ?? catalog.body.courses[0];
assert.ok(primary, "course-service catalog must include a published course");
if (!primary.enrolled) {
  await call(`${courseBase}/enrollment/courses/${primary.id}/enroll`, {
    method: "POST",
    headers: json(student),
    body: "{}",
  });
}

const forbidden = await call(`${base}/courses/${primary.id}/homework`, {
  method: "POST",
  headers: json(student),
  body: JSON.stringify({ title: "越权作业" }),
});
assert.equal(forbidden.status, 403);

const created = await call(`${base}/courses/${primary.id}/homework`, {
  method: "POST",
  headers: json(teacher),
  body: JSON.stringify({ title: `作业冒烟 ${Date.now()}`, published: false }),
});
assert.equal(created.status, 201, JSON.stringify(created.body));
const homeworkId = created.body.homework.id;

const published = await call(`${base}/homework/${homeworkId}/publish`, {
  method: "PATCH",
  headers: json(teacher),
  body: JSON.stringify({ published: true }),
});
assert.equal(published.status, 200);
assert.equal(published.body.homework.published, true);

const studentList = await call(`${base}/courses/${primary.id}/homework`, { headers: { authorization: `Bearer ${student}` } });
assert.equal(studentList.status, 200);
assert.ok(studentList.body.homeworks.some((item) => item.id === homeworkId));

const submitted = await call(`${base}/homework/${homeworkId}/submit`, {
  method: "POST",
  headers: json(student),
  body: JSON.stringify({ content: "冒烟提交" }),
});
assert.equal(submitted.status, 200, JSON.stringify(submitted.body));

const submissions = await call(`${base}/homework/${homeworkId}/submissions`, { headers: { authorization: `Bearer ${teacher}` } });
assert.equal(submissions.status, 200);
const sid = submissions.body.submissions[0].id;
const graded = await call(`${base}/homework/submissions/${sid}/grade`, {
  method: "PATCH",
  headers: json(teacher),
  body: JSON.stringify({ score: 90, feedback: "通过" }),
});
assert.equal(graded.status, 200);

const released = await call(`${base}/homework/${homeworkId}/release-grades`, {
  method: "PATCH",
  headers: json(teacher),
  body: "{}",
});
assert.equal(released.status, 200);

const gradebook = await call(`${base}/courses/${primary.id}/gradebook`, { headers: { authorization: `Bearer ${teacher}` } });
assert.equal(gradebook.status, 200);
assert.equal(gradebook.body.labStatus, "UNAVAILABLE");
assert.ok(gradebook.body.weights.lab + gradebook.body.weights.homework === 1);

const config = await call(`${base}/courses/${primary.id}/grading-config`, {
  method: "PATCH",
  headers: json(teacher),
  body: JSON.stringify({ labWeight: 0.4, homeworkWeight: 0.6 }),
});
assert.equal(config.status, 200);
assert.equal(config.body.config.homeworkWeight, 0.6);

const studentId = submissions.body.submissions[0].userId;

const noInternal = await call(`${base}/internal/courses/${primary.id}/final-gradebook`);
assert.equal(noInternal.status, 401);
assert.equal(noInternal.body.code, "INTERNAL_UNAUTHORIZED");

const finalBook = await call(`${base}/internal/courses/${primary.id}/final-gradebook`, {
  headers: { "x-internal-service-token": internalToken },
});
assert.equal(finalBook.status, 200, JSON.stringify(finalBook.body));
assert.equal(finalBook.body.labStatus, "UNAVAILABLE");
assert.ok(Array.isArray(finalBook.body.students));
for (const row of finalBook.body.students) {
  assert.equal(row.summary.totalScore, null);
  assert.notEqual(row.summary.labAverage, 0);
}

const mine = await call(`${base}/internal/courses/${primary.id}/users/${studentId}/homework-grade`, {
  headers: { "x-internal-service-token": internalToken },
});
assert.equal(mine.status, 200, JSON.stringify(mine.body));
assert.equal(mine.body.userId, studentId);
assert.ok(mine.body.homeworks.every((row) => row.released === true));

const batched = await call(`${base}/internal/courses/${primary.id}/homework-gradebook/batch`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-internal-service-token": internalToken },
  body: JSON.stringify({ userIds: [studentId] }),
});
assert.equal(batched.status, 200, JSON.stringify(batched.body));
assert.equal(batched.body.items[0].userId, studentId);

console.log("homework-grade-service api smoke passed");
