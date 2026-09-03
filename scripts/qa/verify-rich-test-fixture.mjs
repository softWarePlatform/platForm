import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const manifestPath = resolve(process.env.QA_RICH_MANIFEST ?? "test-results/qa-rich-fixture.json");
const reportPath = resolve(process.env.QA_RICH_VERIFY_REPORT ?? "test-results/qa-rich-fixture-verify.json");
const password = process.env.QA_RICH_PASSWORD ?? "QaRichFixture2026!";
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const baseUrl = String(manifest.baseUrl).replace(/\/$/, "");
const steps = [];

async function request(method, path, token) {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: token ? { authorization: `Bearer ${token}` } : {} });
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

async function check(name, action) {
  const startedAt = Date.now();
  try {
    const result = await action();
    steps.push({ name, status: "passed", durationMs: Date.now() - startedAt, result });
  } catch (error) {
    steps.push({ name, status: "failed", durationMs: Date.now() - startedAt, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

async function login(email) {
  const response = await fetch(`${baseUrl}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
  const body = await response.json().catch(() => null);
  assert.equal(response.status, 200, `login ${email}: ${JSON.stringify(body)}`);
  assert.equal(typeof body?.token, "string");
  return body.token;
}

const teacherToken = await login(manifest.accounts.teachers[0].email);
const studentToken = await login(manifest.accounts.students[0].email);
const first = manifest.resources[0];

await check("teacher Dashboard aggregates seeded courses", async () => {
  const response = await request("GET", "/dashboard/me", teacherToken);
  assert.equal(response.status, 200);
  assert.ok(response.body?.courses?.length >= 2, JSON.stringify(response.body));
  assert.equal(response.body?.dependencies?.homework?.status, "OK");
  assert.equal(response.body?.dependencies?.lab?.status, "OK");
  return { courseCount: response.body.courses.length };
});
await check("student sees two enrolled seeded courses", async () => {
  const response = await request("GET", "/dashboard/me", studentToken);
  assert.equal(response.status, 200);
  assert.ok(response.body?.courses?.length >= 2, JSON.stringify(response.body));
  return { courseCount: response.body.courses.length };
});
await check("student homework list contains seeded work", async () => {
  const response = await request("GET", "/homework/mine", studentToken);
  assert.equal(response.status, 200);
  assert.ok(Array.isArray(response.body?.homeworks) && response.body.homeworks.length >= 2, JSON.stringify(response.body));
  return { homeworkCount: response.body.homeworks.length };
});
await check("student lab overview contains seeded lab sets", async () => {
  const response = await request("GET", "/lab-sets/mine/overview", studentToken);
  assert.equal(response.status, 200);
  assert.ok(Number(response.body?.total ?? 0) >= 2, JSON.stringify(response.body));
  return { labSetCount: response.body.total };
});
await check("student can read seeded discussion", async () => {
  const response = await request("GET", `/labs/${first.labId}/discussions`, studentToken);
  assert.equal(response.status, 200);
  assert.ok(Array.isArray(response.body?.posts) && response.body.posts.length >= 2, JSON.stringify(response.body));
  return { postCount: response.body.posts.length };
});
await check("teacher can read seeded practice sessions", async () => {
  const response = await request("GET", `/courses/${first.courseId}/practice/sessions`, teacherToken);
  assert.equal(response.status, 200);
  assert.ok(Array.isArray(response.body?.sessions) && response.body.sessions.length >= 3, JSON.stringify(response.body));
  return { sessionCount: response.body.sessions.length };
});

const report = { generatedAt: new Date().toISOString(), datasetId: manifest.datasetId, summary: { total: steps.length, passed: steps.filter((step) => step.status === "passed").length, failed: steps.filter((step) => step.status === "failed").length }, steps };
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report.summary));
