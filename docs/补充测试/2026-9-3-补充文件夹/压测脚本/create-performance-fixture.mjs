import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

function readArgument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const baseUrl = (readArgument("--base-url") ?? "").replace(/\/$/, "");
const label = readArgument("--label") ?? "qa";
const manifestPath = readArgument("--manifest");
const configPath = readArgument("--config");
if (!baseUrl || !manifestPath || !configPath) {
  throw new Error("Usage: node scripts/qa/create-performance-fixture.mjs --base-url <url> --label <name> --manifest <redacted.json> --config <private.json>");
}

const suffix = `${Date.now()}-${process.pid}`;
const password = process.env.QA_FIXTURE_PASSWORD ?? "QaFixture2026!";
const teacher = { email: `qa-perf-teacher-${label}-${suffix}@example.test`, name: `QA 性能教师 ${label}` };
const student = { email: `qa-perf-student-${label}-${suffix}@example.test`, name: `QA 性能学生 ${label}` };

async function request(method, path, { token, body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${method} ${path} failed with ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);
  return payload;
}

async function register(user, role) {
  const value = await request("POST", "/auth/register", { body: { ...user, password, role } });
  if (!value?.token || !value?.user?.id) throw new Error(`register ${role} did not return a token`);
  return value;
}

const teacherAuth = await register(teacher, "TEACHER");
const studentAuth = await register(student, "STUDENT");
const course = await request("POST", "/courses", {
  token: teacherAuth.token,
  body: {
    title: `QA 性能对比课程 ${label} ${suffix}`,
    description: "隔离的单体与微服务性能对比数据；由 QA 自动化创建。",
    category: "QA",
    courseCode: `QA-${suffix}`.slice(0, 32),
    capacity: 20,
    published: true,
    scheduleSlots: [{ dayOfWeek: 2, periodStart: 3, periodEnd: 4, room: "QA-101" }],
  },
});
const courseId = course.course?.id;
if (!courseId) throw new Error("course creation did not return course.id");

// The monolith accepts published at creation; course-service requires this
// separate call. A 404 means the former and is deliberately harmless.
const published = await fetch(`${baseUrl}/courses/${courseId}/publish`, { method: "POST", headers: { authorization: `Bearer ${teacherAuth.token}` } });
if (![200, 404].includes(published.status)) throw new Error(`publish course failed with ${published.status}`);

const enrollmentResponse = await fetch(`${baseUrl}/enrollment/courses/${courseId}/enroll`, {
  method: "POST",
  headers: { authorization: `Bearer ${studentAuth.token}`, "content-type": "application/json" },
  body: "{}",
});
const enrollmentCreated = enrollmentResponse.ok;
if (!enrollmentCreated && enrollmentResponse.status !== 403) {
  const payload = await enrollmentResponse.text();
  throw new Error(`enroll performance student failed with ${enrollmentResponse.status}: ${payload.slice(0, 500)}`);
}
const homework = await request("POST", `/courses/${courseId}/homework`, {
  token: teacherAuth.token,
  body: { title: `QA 性能作业 ${suffix}`, descriptionMd: "性能测试的已发布作业", dueAt: new Date(Date.now() + 86_400_000).toISOString(), published: true, answerMode: "RICH_TEXT" },
});
const labSet = await request("POST", `/courses/${courseId}/lab-sets`, {
  token: teacherAuth.token,
  body: { title: `QA 性能实验集 ${suffix}`, description: "性能测试实验集", startAt: new Date(Date.now() - 3_600_000).toISOString(), dueAt: new Date(Date.now() + 86_400_000).toISOString(), outsideAccessMode: "BLOCK" },
});
const labSetId = labSet.labSet?.id;
if (!labSetId) throw new Error("lab-set creation did not return labSet.id");
const lab = await request("POST", `/courses/${courseId}/labs`, {
  token: teacherAuth.token,
  body: { title: `QA 性能实验 ${suffix}`, descriptionMd: "性能测试实验", language: "javascript", starterCode: "console.log('qa');", labSetId },
});

const config = {
  environment: label,
  baseUrl,
  datasetId: `qa-equivalent-fixture-${suffix}`,
  sameMachineEvidence: `Windows Docker Desktop Kubernetes port-forward ${new Date().toISOString()}`,
  runs: 5,
  concurrency: 5,
  requestsPerTarget: 100,
  requestTimeoutMs: 10_000,
  targets: [
    { name: "dashboard-teacher", path: "/dashboard/me", headers: { authorization: `Bearer ${teacherAuth.token}` } },
    { name: "homework-course", path: `/courses/${courseId}/homework`, headers: { authorization: `Bearer ${teacherAuth.token}` } },
    { name: "lab-sets-course", path: `/courses/${courseId}/lab-sets`, headers: { authorization: `Bearer ${teacherAuth.token}` } },
  ],
};
const manifest = {
  createdAt: new Date().toISOString(),
  environment: label,
  baseUrl,
  datasetId: config.datasetId,
  accounts: { teacher: teacher.email, student: student.email },
  resources: { courseId, homeworkId: homework.homework?.id ?? null, labSetId, labId: lab.lab?.id ?? null, enrollmentCreated },
  cleanup: "Retained as an isolated QA fixture. Do not use production data; remove only through a reviewed cleanup operation.",
};
await Promise.all([
  mkdir(dirname(resolve(manifestPath)), { recursive: true }),
  mkdir(dirname(resolve(configPath)), { recursive: true }),
]);
await writeFile(resolve(manifestPath), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
await writeFile(resolve(configPath), `${JSON.stringify(config, null, 2)}\n`, "utf8");
console.log(JSON.stringify(manifest, null, 2));
