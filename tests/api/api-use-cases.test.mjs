import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

import { FIXTURES } from "../../scripts/test-fixtures.mjs";

const apiBaseUrl = (process.env.API_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const results = [];
const cleanup = { announcementId: null, materialId: null, homeworkId: null, practiceSessionId: null };
const context = { studentToken: "", teacherToken: "", adminToken: "" };

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
    `${method} ${path} expected ${expectedStatus}, got ${response.status}: ${JSON.stringify(response.payload).slice(0, 300)}`,
  );
  assert.equal(verify(response.payload, response), true, `${method} ${path} response assertion failed`);
  return response.payload;
}

async function scenario(id, uc, flow, title, run) {
  const startedAt = performance.now();
  try {
    await run();
    results.push({ id, uc, flow, title, status: "passed", durationMs: Number((performance.now() - startedAt).toFixed(2)) });
    console.log(`PASS ${id} ${title}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({ id, uc, flow, title, status: "failed", durationMs: Number((performance.now() - startedAt).toFixed(2)), error: message });
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
  return payload.token;
}

async function prepare() {
  await expectHttp("GET", "/health/ready", {}, 200, (body) => body?.ok === true);
  [context.studentToken, context.teacherToken, context.adminToken] = await Promise.all([
    login("student@demo.local"),
    login("teacher@demo.local"),
    login("admin@demo.local"),
  ]);
}

async function runMainFlows() {
  await scenario("API-01-01", "UC-01", "main", "学生读取选课阶段与窗口状态", async () => {
    await expectHttp("GET", "/enrollment/status", { token: context.studentToken }, 200, (body) => body && typeof body === "object");
  });

  await scenario("API-02-01", "UC-02", "main", "教师读取课程配置与发布信息", async () => {
    await expectHttp(
      "GET",
      `/courses/${FIXTURES.courseId}`,
      { token: context.teacherToken },
      200,
      (body) => body?.course?.id === FIXTURES.courseId,
    );
  });

  await scenario("API-03-01", "UC-03", "main", "教师发布公告后学生标记已读", async () => {
    const created = await expectHttp(
      "POST",
      `/courses/${FIXTURES.courseId}/announcements`,
      {
        token: context.teacherToken,
        body: { title: `API 测试公告 ${Date.now()}`, content: "UC-03 主成功流程", pinned: false },
      },
      200,
      (body) => typeof body?.announcement?.id === "string",
    );
    cleanup.announcementId = created.announcement.id;
    await expectHttp(
      "POST",
      `/announcements/${cleanup.announcementId}/read-status`,
      { token: context.studentToken, body: { read: true } },
      200,
      (body) => body?.ok === true && body?.read === true,
    );
  });

  await scenario("API-04-01", "UC-04", "main", "教师上传资料后学生下载原文件", async () => {
    const form = new FormData();
    form.append("title", "API 测试资料");
    form.append("folderPath", "自动化测试/今日");
    form.append("visibility", "ALL");
    form.append("notify", "false");
    form.append("file", new Blob(["api-material-content"], { type: "text/plain" }), "api-material.txt");
    const created = await expectHttp(
      "POST",
      `/courses/${FIXTURES.courseId}/materials`,
      { token: context.teacherToken, form },
      200,
      (body) => Array.isArray(body?.materials) && body.materials.length === 1,
    );
    cleanup.materialId = created.materials[0].id;
    await expectHttp(
      "GET",
      `/courses/${FIXTURES.courseId}/materials/${cleanup.materialId}/download`,
      { token: context.studentToken },
      200,
      (body) => Buffer.isBuffer(body) && body.toString("utf8") === "api-material-content",
    );
  });

  await scenario("API-05-01", "UC-05", "main", "教师发布作业后学生提交文本答案", async () => {
    const created = await expectHttp(
      "POST",
      `/courses/${FIXTURES.courseId}/homework`,
      {
        token: context.teacherToken,
        body: {
          title: `API 测试作业 ${Date.now()}`,
          descriptionMd: "UC-05 主成功流程",
          dueAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          published: true,
          answerMode: "RICH_TEXT",
        },
      },
      200,
      (body) => typeof body?.homework?.id === "string",
    );
    cleanup.homeworkId = created.homework.id;
    await expectHttp(
      "POST",
      `/homework/${cleanup.homeworkId}/submit`,
      { token: context.studentToken, body: { content: "API 自动化提交内容" } },
      200,
      (body) => body?.message === "提交成功" && body?.submission?.locked === true,
    );
  });

  await scenario("API-06-01", "UC-06", "main", "学生读取实验集及时间窗状态", async () => {
    await expectHttp(
      "GET",
      `/courses/${FIXTURES.courseId}/lab-sets`,
      { token: context.studentToken },
      200,
      (body) => Array.isArray(body?.labSets),
    );
  });

  await scenario("API-07-01", "UC-07", "main", "学生智能组卷并读取练习会话", async () => {
    const created = await expectHttp(
      "POST",
      `/courses/${FIXTURES.courseId}/practice/sessions`,
      { token: context.studentToken, body: { mode: "SMART", count: 1 } },
      200,
      (body) => typeof body?.session?.id === "string",
    );
    cleanup.practiceSessionId = created.session.id;
    await expectHttp(
      "GET",
      `/practice/sessions/${cleanup.practiceSessionId}`,
      { token: context.studentToken },
      200,
      (body) => body?.session?.id === cleanup.practiceSessionId,
    );
  });

  await scenario("API-08-01", "UC-08", "main", "学生读取课程讨论与成员列表", async () => {
    await expectHttp(
      "GET",
      `/courses/${FIXTURES.courseId}/discussions`,
      { token: context.studentToken },
      200,
      (body) => Array.isArray(body?.posts),
    );
    await expectHttp(
      "GET",
      `/courses/${FIXTURES.courseId}/discussion-members`,
      { token: context.studentToken },
      200,
      (body) => Array.isArray(body?.members),
    );
  });

  await scenario("API-09-01", "UC-09", "main", "学生读取成绩汇总与课程权重", async () => {
    await expectHttp("GET", "/grades/me", { token: context.studentToken }, 200, (body) => Array.isArray(body?.courses));
  });

  await scenario("API-10-01", "UC-10", "main", "管理员读取操作审计记录", async () => {
    await expectHttp("GET", "/admin/audit", { token: context.adminToken }, 200, (body) => Array.isArray(body?.logs));
  });
}

async function runAlternativeFlows() {
  await scenario("API-03-02", "UC-03", "alternative", "学生发布公告被权限校验拒绝", async () => {
    await expectHttp(
      "POST",
      `/courses/${FIXTURES.courseId}/announcements`,
      { token: context.studentToken, body: { title: "越权公告", content: "不应创建" } },
      403,
      (body) => typeof body?.error === "string",
    );
  });

  await scenario("API-04-02", "UC-04", "alternative", "上传资料缺少 file 字段返回参数错误", async () => {
    const form = new FormData();
    form.append("title", "缺少文件");
    await expectHttp(
      "POST",
      `/courses/${FIXTURES.courseId}/materials`,
      { token: context.teacherToken, form },
      400,
      (body) => typeof body?.error === "string",
    );
  });

  await scenario("API-05-02", "UC-05", "alternative", "创建空标题作业返回参数错误", async () => {
    await expectHttp(
      "POST",
      `/courses/${FIXTURES.courseId}/homework`,
      { token: context.teacherToken, body: { title: "", published: true } },
      400,
      (body) => body?.error === "参数无效",
    );
  });

  await scenario("API-07-02", "UC-07", "alternative", "组卷数量为零返回参数错误", async () => {
    await expectHttp(
      "POST",
      `/courses/${FIXTURES.courseId}/practice/sessions`,
      { token: context.studentToken, body: { mode: "SMART", count: 0 } },
      400,
      (body) => typeof body?.error === "string",
    );
  });

  await scenario("API-10-02", "UC-10", "alternative", "教师访问管理员审计接口被拒绝", async () => {
    await expectHttp("GET", "/admin/audit", { token: context.teacherToken }, 403, (body) => typeof body?.error === "string");
  });
}

async function cleanupCreatedData() {
  const calls = [];
  if (cleanup.practiceSessionId) calls.push(http("DELETE", `/practice/sessions/${cleanup.practiceSessionId}`, { token: context.studentToken }));
  if (cleanup.homeworkId) calls.push(http("DELETE", `/homework/${cleanup.homeworkId}`, { token: context.teacherToken }));
  if (cleanup.materialId) calls.push(http("DELETE", `/courses/${FIXTURES.courseId}/materials/${cleanup.materialId}`, { token: context.teacherToken }));
  if (cleanup.announcementId) calls.push(http("DELETE", `/announcements/${cleanup.announcementId}`, { token: context.teacherToken }));
  await Promise.allSettled(calls);
}

let setupError = null;
try {
  await prepare();
  await runMainFlows();
  await runAlternativeFlows();
} catch (error) {
  setupError = error instanceof Error ? error.message : String(error);
  console.error(`API test setup failed: ${setupError}`);
} finally {
  await cleanupCreatedData();
}

const mainResults = results.filter((item) => item.flow === "main");
const alternativeResults = results.filter((item) => item.flow === "alternative");
const report = {
  generatedAt: new Date().toISOString(),
  apiBaseUrl,
  summary: {
    total: results.length,
    passed: results.filter((item) => item.status === "passed").length,
    failed: results.filter((item) => item.status === "failed").length + (setupError ? 1 : 0),
    mainFlowTotal: mainResults.length,
    mainFlowPassed: mainResults.filter((item) => item.status === "passed").length,
    alternativeFlowTotal: alternativeResults.length,
    alternativeFlowPassed: alternativeResults.filter((item) => item.status === "passed").length,
  },
  results,
  ...(setupError ? { setupError } : {}),
};

await mkdir("test-results", { recursive: true });
await writeFile("test-results/api-use-cases.json", `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));

if (report.summary.failed > 0 || report.summary.total !== 15) process.exitCode = 1;
