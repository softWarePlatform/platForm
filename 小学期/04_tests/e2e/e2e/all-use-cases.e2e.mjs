import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";

import { FIXTURES } from "../../scripts/test-fixtures.mjs";

const apiBaseUrl = (process.env.E2E_BASE_URL ?? process.env.API_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const reportPath = resolve(process.env.E2E_REPORT_PATH ?? "test-results/e2e-local.json");
const runId = `${Date.now()}-${process.pid}`;
const results = [];
const cleanup = {
  announcementId: null,
  materialId: null,
  homeworkId: null,
  labSetId: null,
  labId: null,
  discussionId: null,
  practiceSessionId: null,
  temporaryUserId: null,
  temporaryUserDeleted: false,
  courseDescription: undefined,
  gradingConfig: null,
};
const context = {
  studentToken: "",
  teacherToken: "",
  adminToken: "",
  temporaryStudentToken: "",
  temporaryStudentEmail: `e2e-${runId}@example.test`,
  teacherId: "",
};

async function http(method, path, { token, body, form } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  let requestBody;
  if (body !== undefined) {
    headers["content-type"] = "application/json";
    requestBody = JSON.stringify(body);
  } else if (form) {
    requestBody = form;
  }
  const response = await fetch(`${apiBaseUrl}${path}`, { method, headers, body: requestBody });
  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : Buffer.from(await response.arrayBuffer());
  return { status: response.status, payload, contentType };
}

async function expectHttp(method, path, options, expectedStatus, verify = () => true) {
  const response = await http(method, path, options);
  assert.equal(
    response.status,
    expectedStatus,
    `${method} ${path} expected ${expectedStatus}, got ${response.status}: ${JSON.stringify(response.payload).slice(0, 500)}`,
  );
  assert.equal(verify(response.payload, response), true, `${method} ${path} response assertion failed`);
  return response.payload;
}

async function scenario(id, uc, title, run) {
  const startedAt = performance.now();
  const steps = [];
  const step = async (name, action) => {
    const stepStartedAt = performance.now();
    const value = await action();
    steps.push({ name, status: "passed", durationMs: Number((performance.now() - stepStartedAt).toFixed(2)) });
    return value;
  };
  try {
    await run(step);
    results.push({ id, uc, flow: "end-to-end", title, status: "passed", durationMs: Number((performance.now() - startedAt).toFixed(2)), steps });
    console.log(`PASS ${id} ${title}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    steps.push({ name: "failure", status: "failed", error: message });
    results.push({ id, uc, flow: "end-to-end", title, status: "failed", durationMs: Number((performance.now() - startedAt).toFixed(2)), steps, error: message });
    console.error(`FAIL ${id} ${title}: ${message}`);
  }
}

async function login(email) {
  const payload = await expectHttp(
    "POST",
    "/auth/login",
    { body: { email, password: "Demo123456" } },
    200,
    (value) => typeof value?.token === "string" && value.token.length > 20,
  );
  return payload;
}

async function prepare() {
  await expectHttp("GET", "/health/ready", {}, 200, (body) => body?.ok === true);
  const [student, teacher, admin] = await Promise.all([
    login("student@demo.local"),
    login("teacher@demo.local"),
    login("admin@demo.local"),
  ]);
  context.studentToken = student.token;
  context.teacherToken = teacher.token;
  context.adminToken = admin.token;
  context.teacherId = teacher.user.id;

  const registered = await expectHttp(
    "POST",
    "/auth/register",
    { body: { email: context.temporaryStudentEmail, password: "Demo123456", name: `E2E临时学生-${runId}`, role: "STUDENT" } },
    200,
    (body) => typeof body?.user?.id === "string" && typeof body?.token === "string",
  );
  cleanup.temporaryUserId = registered.user.id;
  context.temporaryStudentToken = registered.token;
}

async function runUseCases() {
  await scenario("E2E-01-01", "UC-01", "管理员为临时学生加课、学生核对日志、管理员退课", async (step) => {
    await step("管理员加课", () => expectHttp(
      "POST",
      "/enrollment/admin/enroll",
      { token: context.adminToken, body: { userId: cleanup.temporaryUserId, courseId: FIXTURES.courseId } },
      200,
      (body) => body?.ok === true && body?.enrollment?.courseId === FIXTURES.courseId,
    ));
    await step("学生核对加课日志", () => expectHttp(
      "GET",
      "/enrollment/logs",
      { token: context.temporaryStudentToken },
      200,
      (body) => body?.logs?.some((item) => item.courseId === FIXTURES.courseId && item.action === "ADMIN_ENROLL"),
    ));
    await step("管理员退课", () => expectHttp(
      "POST",
      "/enrollment/admin/drop",
      { token: context.adminToken, body: { userId: cleanup.temporaryUserId, courseId: FIXTURES.courseId } },
      200,
      (body) => body?.ok === true,
    ));
    await step("学生核对退课日志", () => expectHttp(
      "GET",
      "/enrollment/logs",
      { token: context.temporaryStudentToken },
      200,
      (body) => body?.logs?.some((item) => item.courseId === FIXTURES.courseId && item.action === "ADMIN_DROP"),
    ));
  });

  await scenario("E2E-02-01", "UC-02", "教师修改课程说明、读取验证并恢复原值", async (step) => {
    const original = await step("读取课程原配置", () => expectHttp(
      "GET",
      `/courses/${FIXTURES.courseId}`,
      { token: context.teacherToken },
      200,
      (body) => body?.course?.id === FIXTURES.courseId,
    ));
    cleanup.courseDescription = original.course.description ?? null;
    const marker = `E2E课程说明-${runId}`;
    await step("教师保存新说明", () => expectHttp(
      "PATCH",
      `/courses/${FIXTURES.courseId}`,
      { token: context.teacherToken, body: { description: marker } },
      200,
      (body) => body?.course?.description === marker,
    ));
    await step("再次读取确认状态变化", () => expectHttp(
      "GET",
      `/courses/${FIXTURES.courseId}`,
      { token: context.teacherToken },
      200,
      (body) => body?.course?.description === marker,
    ));
    await step("恢复原课程说明", async () => {
      const value = await expectHttp(
        "PATCH",
        `/courses/${FIXTURES.courseId}`,
        { token: context.teacherToken, body: { description: cleanup.courseDescription } },
        200,
        (body) => body?.course?.description === cleanup.courseDescription,
      );
      cleanup.courseDescription = undefined;
      return value;
    });
  });

  await scenario("E2E-03-01", "UC-03", "教师发布公告、学生阅读并回查已读状态", async (step) => {
    const created = await step("教师发布公告", () => expectHttp(
      "POST",
      `/courses/${FIXTURES.courseId}/announcements`,
      { token: context.teacherToken, body: { title: `E2E公告-${runId}`, content: "端到端公告链路", pinned: false } },
      200,
      (body) => typeof body?.announcement?.id === "string",
    ));
    cleanup.announcementId = created.announcement.id;
    await step("学生标记已读", () => expectHttp(
      "POST",
      `/announcements/${cleanup.announcementId}/read-status`,
      { token: context.studentToken, body: { read: true } },
      200,
      (body) => body?.ok === true && body?.read === true,
    ));
    await step("学生回查公告列表", () => expectHttp(
      "GET",
      `/courses/${FIXTURES.courseId}/announcements`,
      { token: context.studentToken },
      200,
      (body) => body?.announcements?.some((item) => item.id === cleanup.announcementId && item.read === true),
    ));
  });

  await scenario("E2E-04-01", "UC-04", "教师上传课程资料、学生下载并校验原文", async (step) => {
    const form = new FormData();
    form.append("title", `E2E资料-${runId}`);
    form.append("folderPath", "端到端测试/临时");
    form.append("visibility", "ALL");
    form.append("notify", "false");
    form.append("file", new Blob([`e2e-material-${runId}`], { type: "text/plain" }), `e2e-${runId}.txt`);
    const created = await step("教师上传资料", () => expectHttp(
      "POST",
      `/courses/${FIXTURES.courseId}/materials`,
      { token: context.teacherToken, form },
      200,
      (body) => Array.isArray(body?.materials) && body.materials.length === 1,
    ));
    cleanup.materialId = created.materials[0].id;
    await step("学生下载并校验内容", () => expectHttp(
      "GET",
      `/courses/${FIXTURES.courseId}/materials/${cleanup.materialId}/download`,
      { token: context.studentToken },
      200,
      (body) => Buffer.isBuffer(body) && body.toString("utf8") === `e2e-material-${runId}`,
    ));
  });

  await scenario("E2E-05-01", "UC-05", "作业发布、学生提交、教师批改发布、学生查看成绩", async (step) => {
    const created = await step("教师发布作业", () => expectHttp(
      "POST",
      `/courses/${FIXTURES.courseId}/homework`,
      {
        token: context.teacherToken,
        body: {
          title: `E2E作业-${runId}`,
          descriptionMd: "端到端作业链路",
          dueAt: new Date(Date.now() + 3_600_000).toISOString(),
          published: true,
          answerMode: "RICH_TEXT",
        },
      },
      200,
      (body) => typeof body?.homework?.id === "string",
    ));
    cleanup.homeworkId = created.homework.id;
    await step("学生提交作业", () => expectHttp(
      "POST",
      `/homework/${cleanup.homeworkId}/submit`,
      { token: context.studentToken, body: { content: `E2E作业答案-${runId}` } },
      200,
      (body) => body?.submission?.locked === true,
    ));
    const submissions = await step("教师读取提交记录", () => expectHttp(
      "GET",
      `/homework/${cleanup.homeworkId}/submissions`,
      { token: context.teacherToken },
      200,
      (body) => Array.isArray(body?.submissions) && body.submissions.length === 1,
    ));
    const submissionId = submissions.submissions[0].id;
    await step("教师批改", () => expectHttp(
      "PATCH",
      `/homework/submissions/${submissionId}/grade`,
      { token: context.teacherToken, body: { score: 92, feedback: "E2E批改通过" } },
      200,
      (body) => body?.submission?.graded === true && Number(body?.submission?.score) === 92,
    ));
    await step("教师发布成绩", () => expectHttp(
      "PATCH",
      `/homework/${cleanup.homeworkId}/release-grades`,
      { token: context.teacherToken },
      200,
      (body) => body?.releasedCount === 1,
    ));
    await step("学生查看已发布成绩", () => expectHttp(
      "GET",
      `/homework/${cleanup.homeworkId}/my-status`,
      { token: context.studentToken },
      200,
      (body) => body?.student?.released === true && Number(body?.student?.score) === 92,
    ));
  });

  await scenario("E2E-06-01", "UC-06", "教师建实验与用例、学生提交、系统进入人工评测状态", async (step) => {
    const labSet = await step("教师创建实验集", () => expectHttp(
      "POST",
      `/courses/${FIXTURES.courseId}/lab-sets`,
      {
        token: context.teacherToken,
        body: {
          title: `E2E实验集-${runId}`,
          description: "端到端实验链路",
          startAt: new Date(Date.now() - 3_600_000).toISOString(),
          dueAt: new Date(Date.now() + 3_600_000).toISOString(),
          outsideAccessMode: "BLOCK",
        },
      },
      201,
      (body) => typeof body?.labSet?.id === "string",
    ));
    cleanup.labSetId = labSet.labSet.id;
    await step("切换为人工评测", () => expectHttp(
      "PATCH",
      `/courses/${FIXTURES.courseId}/lab-sets/${cleanup.labSetId}`,
      { token: context.teacherToken, body: { judgeMode: "MANUAL", allowedLanguages: ["javascript"] } },
      200,
      (body) => body?.labSet?.judgeMode === "MANUAL",
    ));
    const lab = await step("教师创建实验题", () => expectHttp(
      "POST",
      `/courses/${FIXTURES.courseId}/labs`,
      {
        token: context.teacherToken,
        body: {
          title: `E2E实验题-${runId}`,
          descriptionMd: "读取输入并输出相同内容",
          language: "javascript",
          starterCode: "process.stdin.pipe(process.stdout);",
          labSetId: cleanup.labSetId,
        },
      },
      200,
      (body) => typeof body?.lab?.id === "string",
    ));
    cleanup.labId = lab.lab.id;
    await step("教师录入测试用例", () => expectHttp(
      "POST",
      `/labs/${cleanup.labId}/testcases/batch`,
      { token: context.teacherToken, body: { testCases: [{ input: "hello", expected: "hello", hidden: false, weight: 1 }] } },
      200,
      (body) => body?.count === 1,
    ));
    const submitted = await step("学生提交代码", () => expectHttp(
      "POST",
      `/labs/${cleanup.labId}/submit`,
      { token: context.studentToken, body: { code: "process.stdin.pipe(process.stdout);", language: "javascript" } },
      200,
      (body) => typeof body?.submissionId === "string" && body?.status === "PENDING_REVIEW",
    ));
    await step("读取提交确认最终状态", () => expectHttp(
      "GET",
      `/submissions/${submitted.submissionId}`,
      { token: context.studentToken },
      200,
      (body) => body?.submission?.id === submitted.submissionId && body?.submission?.status === "PENDING_REVIEW",
    ));
  });

  await scenario("E2E-07-01", "UC-07", "学生智能组卷、逐题作答、提交并查看评分", async (step) => {
    const created = await step("学生智能组卷", () => expectHttp(
      "POST",
      `/courses/${FIXTURES.courseId}/practice/sessions`,
      { token: context.studentToken, body: { mode: "SMART", count: 10 } },
      200,
      (body) => typeof body?.session?.id === "string" && body?.session?.items?.length > 0,
    ));
    cleanup.practiceSessionId = created.session.id;
    await step("逐题保存答案", async () => {
      for (const item of created.session.items) {
        await expectHttp(
          "PATCH",
          `/practice/sessions/${cleanup.practiceSessionId}/items/${item.id}`,
          { token: context.studentToken, body: { answer: "E2E答案", timeSpentMs: 100 } },
          200,
          (body) => body?.item?.id === item.id,
        );
      }
      return true;
    });
    await step("提交练习并自动评分", () => expectHttp(
      "POST",
      `/practice/sessions/${cleanup.practiceSessionId}/submit`,
      { token: context.studentToken },
      200,
      (body) => body?.session?.status === "GRADED" && typeof body?.session?.score === "number",
    ));
    await step("读取评分明细", () => expectHttp(
      "GET",
      `/practice/sessions/${cleanup.practiceSessionId}`,
      { token: context.studentToken },
      200,
      (body) => body?.session?.status === "GRADED" && body?.session?.items?.every((item) => typeof item.correct === "boolean"),
    ));
  });

  await scenario("E2E-08-01", "UC-08", "学生发布实验讨论、教师回复、学生读取并删除", async (step) => {
    assert.ok(cleanup.labId, "UC-06 must create a lab before UC-08");
    const created = await step("学生发布讨论并@教师", () => expectHttp(
      "POST",
      `/labs/${cleanup.labId}/discussions`,
      {
        token: context.studentToken,
        body: { title: `E2E讨论-${runId}`, body: "请解释该实验的输入输出要求", mentionUserIds: [context.teacherId] },
      },
      200,
      (body) => typeof body?.post?.id === "string",
    ));
    cleanup.discussionId = created.post.id;
    await step("教师回复讨论", () => expectHttp(
      "POST",
      `/labs/${cleanup.labId}/discussions/${cleanup.discussionId}/comments`,
      { token: context.teacherToken, body: { body: "输入什么就输出什么。" } },
      200,
      (body) => typeof body?.comment === "object",
    ));
    await step("学生读取讨论详情", () => expectHttp(
      "GET",
      `/labs/${cleanup.labId}/discussions/${cleanup.discussionId}`,
      { token: context.studentToken },
      200,
      (body) => body?.post?.id === cleanup.discussionId && body?.post?.comments?.some((item) => item.body === "输入什么就输出什么。"),
    ));
    await step("学生删除临时讨论", async () => {
      const value = await expectHttp(
        "DELETE",
        `/labs/${cleanup.labId}/discussions/${cleanup.discussionId}`,
        { token: context.studentToken },
        200,
        (body) => body?.ok === true,
      );
      cleanup.discussionId = null;
      return value;
    });
  });

  await scenario("E2E-09-01", "UC-09", "教师调整成绩权重、学生查看总评、恢复原权重", async (step) => {
    const original = await step("读取原成绩权重", () => expectHttp(
      "GET",
      `/courses/${FIXTURES.courseId}/grading-config`,
      { token: context.teacherToken },
      200,
      (body) => typeof body?.config?.labWeight === "number" && typeof body?.config?.homeworkWeight === "number",
    ));
    cleanup.gradingConfig = original.config;
    await step("教师设置70/30权重", () => expectHttp(
      "PATCH",
      `/courses/${FIXTURES.courseId}/grading-config`,
      { token: context.teacherToken, body: { labWeight: 0.7, homeworkWeight: 0.3 } },
      200,
      (body) => body?.config?.labWeight === 0.7 && body?.config?.homeworkWeight === 0.3,
    ));
    await step("学生读取总评与新权重", () => expectHttp(
      "GET",
      "/grades/me",
      { token: context.studentToken },
      200,
      (body) => body?.courses?.some((course) => course.courseId === FIXTURES.courseId && course.weights?.lab === 0.7 && course.weights?.homework === 0.3),
    ));
    await step("恢复原成绩权重", async () => {
      const value = await expectHttp(
        "PATCH",
        `/courses/${FIXTURES.courseId}/grading-config`,
        { token: context.teacherToken, body: cleanup.gradingConfig },
        200,
        (body) => body?.config?.labWeight === cleanup.gradingConfig.labWeight && body?.config?.homeworkWeight === cleanup.gradingConfig.homeworkWeight,
      );
      cleanup.gradingConfig = null;
      return value;
    });
  });

  await scenario("E2E-10-01", "UC-10", "管理员查看临时用户日志、删除用户并核对审计记录", async (step) => {
    await step("管理员查看用户操作日志", () => expectHttp(
      "GET",
      `/admin/users/${cleanup.temporaryUserId}/logs`,
      { token: context.adminToken },
      200,
      (body) => body?.user?.id === cleanup.temporaryUserId && body?.logs?.enrollment?.length >= 2,
    ));
    await step("管理员删除临时用户", async () => {
      const value = await expectHttp(
        "DELETE",
        `/admin/users/${cleanup.temporaryUserId}`,
        { token: context.adminToken },
        200,
        (body) => body?.ok === true,
      );
      cleanup.temporaryUserDeleted = true;
      return value;
    });
    await step("核对删除审计记录", () => expectHttp(
      "GET",
      "/admin/audit",
      { token: context.adminToken },
      200,
      (body) => body?.logs?.some((item) => item.type === "ADMIN_DELETE_USER" && item.detail.includes(context.temporaryStudentEmail)),
    ));
  });
}

async function cleanupCreatedData() {
  const cleanupResults = [];
  const attempt = async (name, action) => {
    try {
      const response = await action();
      cleanupResults.push({ name, status: response.status >= 200 && response.status < 300 ? "cleaned" : "warning", httpStatus: response.status });
    } catch (error) {
      cleanupResults.push({ name, status: "warning", error: error instanceof Error ? error.message : String(error) });
    }
  };

  if (cleanup.courseDescription !== undefined) {
    await attempt("restore-course-description", () => http("PATCH", `/courses/${FIXTURES.courseId}`, { token: context.teacherToken, body: { description: cleanup.courseDescription } }));
  }
  if (cleanup.gradingConfig) {
    await attempt("restore-grading-config", () => http("PATCH", `/courses/${FIXTURES.courseId}/grading-config`, { token: context.teacherToken, body: cleanup.gradingConfig }));
  }
  if (cleanup.discussionId && cleanup.labId) {
    await attempt("delete-discussion", () => http("DELETE", `/labs/${cleanup.labId}/discussions/${cleanup.discussionId}`, { token: context.studentToken }));
  }
  if (cleanup.practiceSessionId) {
    await attempt("delete-practice-session", () => http("DELETE", `/practice/sessions/${cleanup.practiceSessionId}`, { token: context.studentToken }));
  }
  if (cleanup.homeworkId) {
    await attempt("delete-homework", () => http("DELETE", `/homework/${cleanup.homeworkId}`, { token: context.teacherToken }));
  }
  if (cleanup.materialId) {
    await attempt("delete-material", () => http("DELETE", `/courses/${FIXTURES.courseId}/materials/${cleanup.materialId}`, { token: context.teacherToken }));
  }
  if (cleanup.announcementId) {
    await attempt("delete-announcement", () => http("DELETE", `/announcements/${cleanup.announcementId}`, { token: context.teacherToken }));
  }
  if (cleanup.labSetId) {
    await attempt("delete-lab-set", () => http("DELETE", `/courses/${FIXTURES.courseId}/lab-sets/${cleanup.labSetId}?force=1`, { token: context.teacherToken }));
  }
  if (cleanup.temporaryUserId && !cleanup.temporaryUserDeleted) {
    await attempt("delete-temporary-user", () => http("DELETE", `/admin/users/${cleanup.temporaryUserId}`, { token: context.adminToken }));
  }
  return cleanupResults;
}

let setupError = null;
let cleanupResults = [];
try {
  await prepare();
  await runUseCases();
} catch (error) {
  setupError = error instanceof Error ? error.message : String(error);
  console.error(`E2E setup failed: ${setupError}`);
} finally {
  cleanupResults = await cleanupCreatedData();
}

const report = {
  generatedAt: new Date().toISOString(),
  environment: process.env.E2E_ENVIRONMENT ?? "local-compose",
  apiBaseUrl,
  summary: {
    total: results.length,
    passed: results.filter((item) => item.status === "passed").length,
    failed: results.filter((item) => item.status === "failed").length + (setupError ? 1 : 0),
    useCasesCovered: new Set(results.map((item) => item.uc)).size,
    expectedUseCases: 10,
  },
  results,
  cleanup: cleanupResults,
  ...(setupError ? { setupError } : {}),
};

await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));

if (report.summary.failed > 0 || report.summary.total !== 10 || report.summary.useCasesCovered !== 10) process.exitCode = 1;
