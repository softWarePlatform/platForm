import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const baseUrl = (process.env.E2E_BASE_URL ?? "http://127.0.0.1:18080/api").replace(/\/$/, "");
const phase = process.env.QA_RESILIENCE_PHASE ?? "baseline";
const reportPath = resolve(process.env.QA_RESILIENCE_REPORT ?? `test-results/cross-service-${phase}.json`);
const password = process.env.E2E_PASSWORD ?? "Course123456";
const studentEmail = process.env.E2E_STUDENT_EMAIL ?? "student@course.local";
const teacherEmail = process.env.E2E_TEACHER_EMAIL ?? "teacher@course.local";
const runId = `resilience-${Date.now()}-${process.pid}`;
const steps = [];

async function request(method, path, { token, body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      "x-request-id": `${runId}-${steps.length + 1}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

async function check(name, action) {
  const startedAt = Date.now();
  try {
    const result = await action();
    steps.push({ name, status: "passed", durationMs: Date.now() - startedAt, result });
    return result;
  } catch (error) {
    steps.push({ name, status: "failed", durationMs: Date.now() - startedAt, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

async function login(email) {
  const response = await request("POST", "/auth/login", { body: { email, password } });
  assert.equal(response.status, 200, `login failed: ${JSON.stringify(response.body)}`);
  assert.equal(typeof response.body?.token, "string");
  return response.body.token;
}

async function verifyEmptyResult() {
  const suffix = `${Date.now()}-${process.pid}`;
  const email = `qa-empty-${suffix}@example.test`;
  const created = await request("POST", "/auth/register", {
    body: { email, name: `QA 空结果学生 ${suffix}`, password, role: "STUDENT" },
  });
  assert.ok([200, 201].includes(created.status), `register failed: ${JSON.stringify(created.body)}`);
  const token = created.body?.token;
  assert.equal(typeof token, "string");

  const [dashboard, homework, labs] = await Promise.all([
    request("GET", "/dashboard/me", { token }),
    request("GET", "/homework/mine", { token }),
    request("GET", "/lab-sets/mine/overview", { token }),
  ]);
  assert.equal(dashboard.status, 200);
  assert.deepEqual(dashboard.body?.courses, []);
  assert.equal(homework.status, 200);
  assert.equal(labs.status, 200);
  return {
    dashboardCourses: dashboard.body.courses.length,
    homeworkKeys: Object.keys(homework.body ?? {}).sort(),
    labOverviewKeys: Object.keys(labs.body ?? {}).sort(),
  };
}

const studentToken = await login(studentEmail);
const teacherToken = await login(teacherEmail);
if (phase === "downstream-unavailable") {
  await check("Course Dashboard gracefully degrades when Homework is unavailable", async () => {
    const response = await request("GET", "/dashboard/me", { token: teacherToken });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.ok(response.body?.courses?.length > 0, "teacher must own a course so Dashboard invokes Homework");
    assert.equal(response.body?.dependencies?.homework?.status, "UNAVAILABLE", JSON.stringify(response.body));
    return { httpStatus: response.status, dependency: response.body.dependencies.homework };
  });
  await check("Gateway returns a stable error for the unavailable Homework service", async () => {
    const response = await request("GET", "/homework/mine", { token: studentToken });
    assert.equal(response.status, 502, JSON.stringify(response.body));
    assert.equal(response.body?.code, "BAD_GATEWAY", JSON.stringify(response.body));
    return { httpStatus: response.status, code: response.body.code, message: response.body.message };
  });
} else {
  await check("Dashboard dependencies are available", async () => {
    const response = await request("GET", "/dashboard/me", { token: teacherToken });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.ok(response.body?.courses?.length > 0, "teacher must own a course so Dashboard invokes downstream services");
    assert.equal(response.body?.dependencies?.homework?.status, "OK", JSON.stringify(response.body));
    assert.equal(response.body?.dependencies?.lab?.status, "OK", JSON.stringify(response.body));
    return { httpStatus: response.status, dependencies: response.body.dependencies };
  });
  await check("Empty result stays a successful, typed response", verifyEmptyResult);
}

const report = {
  generatedAt: new Date().toISOString(),
  environment: process.env.E2E_ENVIRONMENT ?? "microservices-kubernetes",
  phase,
  baseUrl,
  summary: { total: steps.length, passed: steps.filter((step) => step.status === "passed").length, failed: steps.filter((step) => step.status === "failed").length },
  steps,
};
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report.summary));
