import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";

const baseUrl = (process.env.E2E_BASE_URL ?? "http://127.0.0.1:18080/api").replace(/\/$/, "");
const reportPath = resolve(process.env.E2E_REPORT_PATH ?? "test-results/e2e-microservices-k8s.json");
const runId = `${Date.now()}-${process.pid}`;
const password = process.env.E2E_PASSWORD ?? "Course123456";
const accounts = {
  admin: process.env.E2E_ADMIN_EMAIL ?? "admin@course.local",
  teacher: process.env.E2E_TEACHER_EMAIL ?? "teacher@course.local",
  student: process.env.E2E_STUDENT_EMAIL ?? "student@course.local",
};
const state = { courseId: "", enrolled: false, description: null, period: null, homeworkId: null, labSetId: null, labId: null, practiceQuestionId: null, practiceSessionId: null, gradingConfig: null };
const auth = { admin: "", teacher: "", student: "", teacherId: "" };
const results = [];

async function http(method, path, { token, body, form } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  let requestBody;
  if (body !== undefined) {
    headers["content-type"] = "application/json";
    requestBody = JSON.stringify(body);
  } else if (form) requestBody = form;
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body: requestBody });
  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json") ? await response.json() : Buffer.from(await response.arrayBuffer());
  return { status: response.status, payload };
}

async function expectHttp(method, path, options, status, verify = () => true) {
  const response = await http(method, path, options);
  assert.equal(response.status, status, `${method} ${path}: expected ${status}, got ${response.status}: ${JSON.stringify(response.payload).slice(0, 500)}`);
  assert.equal(verify(response.payload), true, `${method} ${path}: response assertion failed: ${JSON.stringify(response.payload).slice(0, 500)}`);
  return response.payload;
}

async function scenario(id, uc, title, run) {
  const started = performance.now();
  const steps = [];
  const step = async (name, action) => {
    const at = performance.now();
    try {
      const value = await action();
      steps.push({ name, status: "passed", durationMs: Number((performance.now() - at).toFixed(2)) });
      return value;
    } catch (error) {
      steps.push({ name, status: "failed", error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  };
  try {
    await run(step);
    results.push({ id, uc, title, status: "passed", durationMs: Number((performance.now() - started).toFixed(2)), steps });
    console.log(`PASS ${id} ${title}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({ id, uc, title, status: "failed", durationMs: Number((performance.now() - started).toFixed(2)), steps, error: message });
    console.error(`FAIL ${id} ${title}: ${message}`);
  }
}

async function login(email) {
  return expectHttp("POST", "/auth/login", { body: { email, password } }, 200, (v) => typeof v?.token === "string");
}

async function prepare() {
  await expectHttp("GET", "/health/ready", {}, 200, (v) => v?.ok === true);
  const [admin, teacher, student] = await Promise.all([login(accounts.admin), login(accounts.teacher), login(accounts.student)]);
  auth.admin = admin.token; auth.teacher = teacher.token; auth.student = student.token; auth.teacherId = teacher.user.id;
  const catalog = await expectHttp("GET", "/courses/mine", { token: auth.teacher }, 200, (v) => Array.isArray(v?.courses) && v.courses.length > 0);
  state.courseId = process.env.E2E_COURSE_ID ?? catalog.courses.find((course) => course.title === "课程服务演示课程")?.id ?? catalog.courses[0].id;
}

async function runUseCases() {
  await scenario("E2E-MS-01", "UC-01", "学生选课、课表同步、退课并恢复测试前置", async (step) => {
    await step("学生选课", () => expectHttp("POST", `/enrollment/courses/${state.courseId}/enroll`, { token: auth.student }, 201, (v) => v?.ok === true && v?.enrollment?.courseId === state.courseId));
    state.enrolled = true;
    await step("Dashboard 出现课程", () => expectHttp("GET", "/dashboard/me", { token: auth.student }, 200, (v) => v?.courses?.some((c) => c.id === state.courseId) && v?.dependencies?.homework?.status === "OK" && v?.dependencies?.lab?.status === "OK"));
    await step("学生退课", () => expectHttp("DELETE", `/enrollment/courses/${state.courseId}/enroll`, { token: auth.student }, 200, (v) => v?.ok === true));
    state.enrolled = false;
    await step("退课后课表移除", () => expectHttp("GET", "/dashboard/me", { token: auth.student }, 200, (v) => !v?.courses?.some((c) => c.id === state.courseId)));
    await step("重新选课供后续用例", () => expectHttp("POST", `/enrollment/courses/${state.courseId}/enroll`, { token: auth.student }, 201, (v) => v?.ok === true));
    state.enrolled = true;
  });

  await scenario("E2E-MS-02", "UC-02", "教师配置课程、权限校验并恢复", async (step) => {
    const original = await step("读取课程", () => expectHttp("GET", `/courses/${state.courseId}`, { token: auth.teacher }, 200, (v) => v?.course?.id === state.courseId));
    state.description = original.course.description ?? null;
    const marker = `微服务E2E课程说明-${runId}`;
    await step("教师更新课程", () => expectHttp("PATCH", `/courses/${state.courseId}`, { token: auth.teacher, body: { description: marker } }, 200, (v) => v?.course?.description === marker));
    await step("学生修改被拒绝", () => expectHttp("PATCH", `/courses/${state.courseId}`, { token: auth.student, body: { description: "forbidden" } }, 403));
    await step("恢复课程", () => expectHttp("PATCH", `/courses/${state.courseId}`, { token: auth.teacher, body: { description: state.description } }, 200, (v) => v?.course?.description === state.description));
    state.description = null;
  });

  await scenario("E2E-MS-03", "UC-03", "教师发布公告、学生阅读、通知状态联动", async (step) => {
    const created = await step("发布公告", () => expectHttp("POST", `/courses/${state.courseId}/announcements`, { token: auth.teacher, body: { title: `E2E公告-${runId}`, content: "微服务公告链路", pinned: false } }, 201, (v) => typeof v?.announcement?.id === "string"));
    const id = created.announcement.id;
    await step("学生标记已读", () => expectHttp("POST", `/announcements/${id}/read`, { token: auth.student }, 200, (v) => v?.ok === true));
    await step("列表反映已读", () => expectHttp("GET", `/courses/${state.courseId}/announcements`, { token: auth.student }, 200, (v) => v?.announcements?.some((a) => a.id === id && a.read === true)));
  });

  await scenario("E2E-MS-04", "UC-04", "教师上传资料、学生收藏与下载", async (step) => {
    const content = `microservice-material-${runId}`;
    const form = new FormData(); form.append("title", `E2E资料-${runId}`); form.append("visibility", "ALL"); form.append("file", new Blob([content], { type: "text/plain" }), "e2e.txt");
    const created = await step("上传资料", () => expectHttp("POST", `/courses/${state.courseId}/materials`, { token: auth.teacher, form }, 201, (v) => typeof v?.material?.id === "string"));
    const id = created.material.id;
    await step("收藏资料", () => expectHttp("POST", `/materials/${id}/favorite`, { token: auth.student }, 200, (v) => v?.ok === true));
    await step("下载校验", () => expectHttp("GET", `/materials/${id}/download`, { token: auth.student }, 200, (v) => Buffer.isBuffer(v) && v.toString() === content));
  });

  await scenario("E2E-MS-05", "UC-05", "作业发布、提交、批改、成绩发布", async (step) => {
    const created = await step("发布作业", () => expectHttp("POST", `/courses/${state.courseId}/homework`, { token: auth.teacher, body: { title: `E2E作业-${runId}`, descriptionMd: "微服务作业链路", dueAt: new Date(Date.now() + 3600000).toISOString(), published: true, answerMode: "RICH_TEXT" } }, 201, (v) => typeof v?.homework?.id === "string"));
    state.homeworkId = created.homework.id;
    await step("学生提交", () => expectHttp("POST", `/homework/${state.homeworkId}/submit`, { token: auth.student, body: { content: `答案-${runId}` } }, 200, (v) => v?.submission?.locked === true));
    const submissions = await step("教师查看提交", () => expectHttp("GET", `/homework/${state.homeworkId}/submissions`, { token: auth.teacher }, 200, (v) => v?.submissions?.length === 1));
    const submissionId = submissions.submissions[0].id;
    await step("教师批改", () => expectHttp("PATCH", `/homework/submissions/${submissionId}/grade`, { token: auth.teacher, body: { score: 92, feedback: "通过" } }, 200, (v) => Number(v?.submission?.score) === 92));
    await step("发布成绩", () => expectHttp("PATCH", `/homework/${state.homeworkId}/release-grades`, { token: auth.teacher }, 200, (v) => v?.released === 1));
    await step("学生查看成绩", () => expectHttp("GET", `/homework/${state.homeworkId}/my-status`, { token: auth.student }, 200, (v) => v?.submission?.released === true && Number(v?.submission?.score) === 92));
  });

  await scenario("E2E-MS-06", "UC-06", "实验发布、测试用例、人工评测提交", async (step) => {
    const set = await step("创建实验集", () => expectHttp("POST", `/courses/${state.courseId}/lab-sets`, { token: auth.teacher, body: { title: `E2E实验集-${runId}`, startAt: new Date(Date.now() - 3600000).toISOString(), dueAt: new Date(Date.now() + 3600000).toISOString(), outsideAccessMode: "BLOCK" } }, 201, (v) => typeof v?.labSet?.id === "string"));
    state.labSetId = set.labSet.id;
    await step("配置人工评测", () => expectHttp("PATCH", `/courses/${state.courseId}/lab-sets/${state.labSetId}`, { token: auth.teacher, body: { judgeMode: "MANUAL", allowedLanguages: ["javascript"] } }, 200, (v) => v?.labSet?.judgeMode === "MANUAL"));
    const lab = await step("创建实验", () => expectHttp("POST", `/courses/${state.courseId}/labs`, { token: auth.teacher, body: { title: `E2E实验-${runId}`, descriptionMd: "回显输入", language: "javascript", starterCode: "process.stdin.pipe(process.stdout);", labSetId: state.labSetId } }, 200, (v) => typeof v?.lab?.id === "string"));
    state.labId = lab.lab.id;
    await step("创建用例", () => expectHttp("POST", `/labs/${state.labId}/testcases/batch`, { token: auth.teacher, body: { testCases: [{ input: "hello", expected: "hello", hidden: false, weight: 1 }] } }, 200, (v) => v?.count === 1));
    const submitted = await step("提交代码", () => expectHttp("POST", `/labs/${state.labId}/submit`, { token: auth.student, body: { code: "process.stdin.pipe(process.stdout);", language: "javascript" } }, 200, (v) => typeof v?.submissionId === "string" && v?.status === "PENDING_REVIEW"));
    await step("查询终态", () => expectHttp("GET", `/submissions/${submitted.submissionId}`, { token: auth.student }, 200, (v) => v?.submission?.status === "PENDING_REVIEW"));
  });

  await scenario("E2E-MS-07", "UC-07", "练习建题、组卷、作答与评分", async (step) => {
    const question = await step("教师创建题目", () => expectHttp("POST", `/courses/${state.courseId}/practice/questions`, { token: auth.teacher, body: { type: "FILL", stem: `2+2=${runId}?`, answer: "4", explanation: "基础计算", tagPath: "E2E/基础", difficulty: "EASY" } }, 200, (v) => typeof v?.question?.id === "string"));
    state.practiceQuestionId = question.question.id;
    const session = await step("学生组卷", () => expectHttp("POST", `/courses/${state.courseId}/practice/sessions`, { token: auth.student, body: { mode: "SMART", count: 10 } }, 200, (v) => typeof v?.session?.id === "string" && v?.session?.items?.length > 0));
    state.practiceSessionId = session.session.id;
    for (const item of session.session.items) await step(`保存答案-${item.id}`, () => expectHttp("PATCH", `/practice/sessions/${state.practiceSessionId}/items/${item.id}`, { token: auth.student, body: { answer: "4", timeSpentMs: 10 } }, 200, (v) => v?.item?.id === item.id));
    await step("提交评分", () => expectHttp("POST", `/practice/sessions/${state.practiceSessionId}/submit`, { token: auth.student }, 200, (v) => v?.session?.status === "GRADED" && typeof v?.session?.score === "number"));
  });

  await scenario("E2E-MS-08", "UC-08", "实验讨论、提及、回复与删除", async (step) => {
    assert.ok(state.labId);
    const post = await step("学生发帖", () => expectHttp("POST", `/labs/${state.labId}/discussions`, { token: auth.student, body: { title: `E2E讨论-${runId}`, body: "如何完成回显？", mentionUserIds: [auth.teacherId] } }, 200, (v) => typeof v?.post?.id === "string"));
    await step("教师回复", () => expectHttp("POST", `/labs/${state.labId}/discussions/${post.post.id}/comments`, { token: auth.teacher, body: { body: "读取后原样输出。" } }, 200, (v) => typeof v?.comment === "object"));
    await step("学生查看", () => expectHttp("GET", `/labs/${state.labId}/discussions/${post.post.id}`, { token: auth.student }, 200, (v) => v?.post?.comments?.some((c) => c.body === "读取后原样输出。")));
    await step("学生删除", () => expectHttp("DELETE", `/labs/${state.labId}/discussions/${post.post.id}`, { token: auth.student }, 200, (v) => v?.ok === true));
  });

  await scenario("E2E-MS-09", "UC-09", "跨 Homework/Lab 的综合成绩配置与查询", async (step) => {
    const original = await step("读取权重", () => expectHttp("GET", `/courses/${state.courseId}/grading-config`, { token: auth.teacher }, 200, (v) => typeof v?.config?.labWeight === "number"));
    state.gradingConfig = original.config;
    await step("设置权重", () => expectHttp("PATCH", `/courses/${state.courseId}/grading-config`, { token: auth.teacher, body: { labWeight: 0.7, homeworkWeight: 0.3 } }, 200, (v) => v?.config?.labWeight === 0.7));
    await step("学生查询综合成绩", () => expectHttp("GET", "/grades/me", { token: auth.student }, 200, (v) => v?.courses?.some((c) => c.courseId === state.courseId && c.weights?.lab === 0.7)));
    await step("恢复权重", () => expectHttp("PATCH", `/courses/${state.courseId}/grading-config`, { token: auth.teacher, body: { labWeight: state.gradingConfig.labWeight, homeworkWeight: state.gradingConfig.homeworkWeight } }, 200));
    state.gradingConfig = null;
  });

  await scenario("E2E-MS-10", "UC-10", "管理员维护选课阶段、查询用户与审计并验证权限", async (step) => {
    const current = await step("读取选课阶段", () => expectHttp("GET", "/admin/enrollment-period", { token: auth.admin }, 200, (v) => typeof v === "object"));
    state.period = current.period;
    await step("非法时间被拒绝", () => expectHttp("PUT", "/admin/enrollment-period", { token: auth.admin, body: { phase: "FORMAL", openAt: "2026-12-31T00:00:00Z", closeAt: "2026-01-01T00:00:00Z" } }, 400));
    await step("管理员更新阶段", () => expectHttp("PUT", "/admin/enrollment-period", { token: auth.admin, body: { semesterKey: "2026-fall", label: "2026 秋季学期", phase: "FORMAL", openAt: "2026-01-01T00:00:00Z", closeAt: "2026-12-31T23:59:59Z" } }, 200, (v) => v?.period?.phase === "FORMAL"));
    await step("查询用户", () => expectHttp("GET", "/admin/users", { token: auth.admin }, 200, (v) => v?.users?.some((u) => u.email === accounts.student)));
    await step("查询选课审计", () => expectHttp("GET", "/admin/enrollment-logs", { token: auth.admin }, 200, (v) => Array.isArray(v?.logs) && v.logs.some((l) => l.user?.email === accounts.student)));
    await step("学生访问管理端被拒绝", () => expectHttp("GET", "/admin/users", { token: auth.student }, 403));
  });
}

async function cleanup() {
  const rows = [];
  const attempt = async (name, action) => { try { const r = await action(); rows.push({ name, status: r.status >= 200 && r.status < 300 ? "cleaned" : "warning", httpStatus: r.status }); } catch (e) { rows.push({ name, status: "warning", error: e instanceof Error ? e.message : String(e) }); } };
  if (state.period) await attempt("restore-enrollment-period", () => http("PUT", "/admin/enrollment-period", { token: auth.admin, body: state.period }));
  if (state.gradingConfig) await attempt("restore-grading-config", () => http("PATCH", `/courses/${state.courseId}/grading-config`, { token: auth.teacher, body: { labWeight: state.gradingConfig.labWeight, homeworkWeight: state.gradingConfig.homeworkWeight } }));
  if (state.practiceSessionId) await attempt("delete-practice-session", () => http("DELETE", `/practice/sessions/${state.practiceSessionId}`, { token: auth.student }));
  if (state.practiceQuestionId) await attempt("delete-practice-question", () => http("DELETE", `/practice/questions/${state.practiceQuestionId}`, { token: auth.teacher }));
  if (state.homeworkId) await attempt("delete-homework", () => http("DELETE", `/homework/${state.homeworkId}`, { token: auth.teacher }));
  if (state.labSetId) await attempt("delete-lab-set", () => http("DELETE", `/courses/${state.courseId}/lab-sets/${state.labSetId}?force=1`, { token: auth.teacher }));
  if (state.enrolled) await attempt("drop-student-enrollment", () => http("DELETE", `/enrollment/courses/${state.courseId}/enroll`, { token: auth.student }));
  return rows;
}

let setupError = null;
let cleanupResults = [];
try { await prepare(); await runUseCases(); } catch (error) { setupError = error instanceof Error ? error.message : String(error); console.error(`SETUP FAILED: ${setupError}`); } finally { cleanupResults = await cleanup(); }
const report = {
  generatedAt: new Date().toISOString(), environment: process.env.E2E_ENVIRONMENT ?? "microservices", baseUrl,
  summary: { total: results.length, passed: results.filter((r) => r.status === "passed").length, failed: results.filter((r) => r.status === "failed").length + (setupError ? 1 : 0), useCasesCovered: new Set(results.map((r) => r.uc)).size, expectedUseCases: 10 },
  results, cleanup: cleanupResults, ...(setupError ? { setupError } : {}),
};
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report.summary, null, 2));
if (report.summary.failed || report.summary.total !== 10 || report.summary.useCasesCovered !== 10) process.exitCode = 1;
