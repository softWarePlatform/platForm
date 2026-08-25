/**
 * UC01—UC04 D1 API verification.
 *
 * Run from repository root:
 *   node docs/李璐曼/2026-8-25/uc01-uc04-verify.mjs
 *
 * The script uses disposable data, removes uploaded files through the API,
 * deletes the temporary course through Prisma, and writes JSON evidence.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");
const evidenceDir = resolve(scriptDir, "evidence");
const backendRequire = createRequire(resolve(repoRoot, "backend/package.json"));
backendRequire("dotenv").config({ path: resolve(repoRoot, "backend/.env") });
const { PrismaClient } = backendRequire("@prisma/client");

const prisma = new PrismaClient();
const baseUrl = process.env.API_BASE_URL ?? "http://127.0.0.1:3000";
const runStarted = new Date();
const runId = runStarted.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const courseCode = `D1${runId}`;
const courseTitle = `D1-UC01-04验证课程-${runId}`;
const materialText = `UC04 verification ${runId}\n`;
const fullCourseId = "00000000-0000-4000-8000-000000090001";

const report = {
  metadata: {
    runId,
    startedAt: runStarted.toISOString(),
    baseUrl,
    courseCode,
    testAccounts: [
      "teacher@demo.local",
      "student20@demo.local",
      "student@demo.local",
      "admin@demo.local",
    ],
  },
  preconditions: [],
  cases: [],
  requests: [],
  cleanup: [],
  database: {},
};

const tokens = {};
let testCourseId = null;
let announcementId = null;
let materialId = null;
let periodSnapshot = null;
let periodChanged = false;

function sanitize(value, depth = 0) {
  if (depth > 4) return "[truncated]";
  if (Array.isArray(value)) {
    const items = value.slice(0, 8).map((v) => sanitize(v, depth + 1));
    if (value.length > 8) items.push(`[+${value.length - 8} more]`);
    return items;
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (/token|password|hash/i.test(key)) out[key] = "[redacted]";
      else out[key] = sanitize(item, depth + 1);
    }
    return out;
  }
  if (typeof value === "string" && value.length > 800) return `${value.slice(0, 800)}...[truncated]`;
  return value;
}

function addCase({ id, useCase, flow, scenario, expected, actual, passed, evidence = {} }) {
  report.cases.push({
    id,
    useCase,
    flow,
    scenario,
    expected,
    actual,
    result: passed ? "通过" : "失败",
    evidence: sanitize(evidence),
  });
}

async function api(name, method, path, { token, body, form, record = true } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let requestBody;
  if (form) requestBody = form;
  else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    requestBody = JSON.stringify(body);
  }

  const started = Date.now();
  let response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: requestBody,
    });
  } catch (error) {
    if (record) {
      report.requests.push({
        name,
        method,
        path,
        status: 0,
        durationMs: Date.now() - started,
        error: String(error),
      });
    }
    return { status: 0, ok: false, json: null, text: "", bytes: 0, headers: {} };
  }

  const contentType = response.headers.get("content-type") ?? "";
  const buffer = Buffer.from(await response.arrayBuffer());
  const text = buffer.toString("utf8");
  let json = null;
  if (contentType.includes("json")) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  const result = {
    status: response.status,
    ok: response.ok,
    json,
    text,
    bytes: buffer.length,
    headers: {
      contentType,
      contentDisposition: response.headers.get("content-disposition"),
    },
  };
  if (record) {
    report.requests.push({
      name,
      method,
      path,
      request: form ? "[multipart]" : sanitize(body),
      status: response.status,
      durationMs: Date.now() - started,
      response: json ? sanitize(json) : { bytes: buffer.length, preview: text.slice(0, 200) },
    });
  }
  return result;
}

async function login(alias, email) {
  const result = await api(`login-${alias}`, "POST", "/auth/login", {
    body: { email, password: "Demo123456" },
    record: false,
  });
  tokens[alias] = result.json?.token ?? null;
  report.preconditions.push({
    item: `${email} 登录`,
    expected: "HTTP 200 且返回 token",
    actual: `HTTP ${result.status}${tokens[alias] ? "，已返回 token" : "，未返回 token"}`,
    result: result.status === 200 && tokens[alias] ? "通过" : "失败",
  });
}

async function ensureEnrollmentWindowOpen() {
  const current = await api("enrollment-period-snapshot", "GET", "/enrollment/period", {
    token: tokens.admin,
  });
  periodSnapshot = current.json?.period ?? null;
  const status = await api("enrollment-window-status", "GET", "/enrollment/status", {
    token: tokens.student,
  });
  if (status.json?.window?.open) return;

  const now = Date.now();
  const openBody = {
    label: periodSnapshot?.label ?? "D1 验证临时开放",
    phase: "FORMAL",
    openAt: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
    closeAt: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
    confirmDeadline: periodSnapshot?.confirmDeadline ?? new Date(now + 48 * 60 * 60 * 1000).toISOString(),
  };
  const changed = await api("enrollment-period-temporary-open", "PUT", "/enrollment/period", {
    token: tokens.admin,
    body: openBody,
  });
  periodChanged = changed.status === 200;
  report.preconditions.push({
    item: "选课窗口",
    expected: "当前窗口开放",
    actual: periodChanged ? "原窗口关闭，已临时开放并将在结束时恢复" : `无法开放，HTTP ${changed.status}`,
    result: periodChanged ? "通过" : "失败",
  });
}

async function runUc02() {
  const createBody = {
    title: courseTitle,
    description: "创建阶段",
    category: "软件工程实践",
    published: false,
    courseCode,
    credits: 2,
    capacity: 40,
    courseNature: "ELECTIVE",
    subjectCategory: "CORE_MAJOR",
    offeringCollegeCode: "21",
    scheduleSlots: [{ dayOfWeek: 7, periodStart: 13, periodEnd: 14, room: "D1-T01" }],
  };
  const created = await api("UC02-create-course", "POST", "/courses", {
    token: tokens.teacher,
    body: createBody,
  });
  testCourseId = created.json?.course?.id ?? null;

  const mine = await api("UC02-query-created-course", "GET", "/courses/mine", {
    token: tokens.teacher,
  });
  const persisted = (mine.json?.courses ?? []).find((course) => course.courseCode === courseCode);
  if (!testCourseId && persisted?.id) testCourseId = persisted.id;
  const createLog = testCourseId
    ? await prisma.enrollmentLog.findFirst({
        where: { courseId: testCourseId, action: "COURSE_CREATE" },
        orderBy: { createdAt: "desc" },
      })
    : null;

  addCase({
    id: "UC02-M-01",
    useCase: "UC02",
    flow: "主流程",
    scenario: "教师创建未发布课程",
    expected: "HTTP 200，返回 published=false 的新课程，并同步写入 COURSE_CREATE 日志",
    actual: `HTTP ${created.status}${persisted ? `；课程 ${persisted.id} 已写入` : "；未发现课程"}${createLog ? "；创建日志已写入" : "；未发现创建日志"}`,
    passed: created.status === 200 && created.json?.course?.published === false && !!createLog,
    evidence: {
      response: created.json,
      persistedAfterResponse: persisted ?? null,
      createLog: createLog
        ? { id: createLog.id, action: createLog.action, courseId: createLog.courseId }
        : null,
    },
  });

  if (testCourseId) {
    const configured = await api("UC02-configure-course", "PATCH", `/courses/${testCourseId}`, {
      token: tokens.teacher,
      body: {
        description: "D1 UC01—UC04 当前环境验证课程",
        capacity: 50,
        credits: 3,
        scheduleSlots: [{ dayOfWeek: 7, periodStart: 13, periodEnd: 14, room: "D1-T02" }],
      },
    });
    addCase({
      id: "UC02-M-02",
      useCase: "UC02",
      flow: "主流程",
      scenario: "教师配置课程容量、学分和课表",
      expected: "HTTP 200，capacity=50、credits=3、教室=D1-T02",
      actual: `HTTP ${configured.status}`,
      passed:
        configured.status === 200 &&
        configured.json?.course?.capacity === 50 &&
        configured.json?.course?.credits === 3 &&
        configured.json?.course?.scheduleSlots?.[0]?.room === "D1-T02",
      evidence: configured.json,
    });

    const published = await api("UC02-publish-course", "PATCH", `/courses/${testCourseId}`, {
      token: tokens.teacher,
      body: { published: true },
    });
    const publicList = await api("UC02-public-course-list", "GET", `/courses?search=${encodeURIComponent(courseTitle)}`);
    const visible = (publicList.json?.courses ?? []).some((course) => course.id === testCourseId);
    addCase({
      id: "UC02-M-03",
      useCase: "UC02",
      flow: "主流程",
      scenario: "教师发布课程，学生端公开课程列表可见",
      expected: "发布 HTTP 200，公开列表包含该课程",
      actual: `发布 HTTP ${published.status}，公开列表${visible ? "包含" : "不包含"}该课程`,
      passed: published.status === 200 && published.json?.course?.published === true && visible,
      evidence: { published: published.json, publicCourseCount: publicList.json?.courses?.length ?? null },
    });

    const duplicate = await api("UC02-duplicate-code", "POST", "/courses", {
      token: tokens.teacher,
      body: { ...createBody, title: `${courseTitle}-重复代码` },
    });
    addCase({
      id: "UC02-E-01",
      useCase: "UC02",
      flow: "异常流程",
      scenario: "课程代码重复",
      expected: "HTTP 409，并提示课程代码已存在",
      actual: `HTTP ${duplicate.status}：${duplicate.json?.error ?? duplicate.text.slice(0, 120)}`,
      passed: duplicate.status === 409,
      evidence: duplicate.json,
    });
  } else {
    for (const [id, scenario] of [
      ["UC02-M-02", "教师配置课程容量、学分和课表"],
      ["UC02-M-03", "教师发布课程，学生端公开课程列表可见"],
      ["UC02-E-01", "课程代码重复"],
    ]) {
      addCase({
        id,
        useCase: "UC02",
        flow: id.includes("-M-") ? "主流程" : "异常流程",
        scenario,
        expected: "前置课程创建成功",
        actual: "未获得可继续验证的课程记录",
        passed: false,
      });
    }
  }

  const studentCreate = await api("UC02-student-create-forbidden", "POST", "/courses", {
    token: tokens.student,
    body: createBody,
  });
  addCase({
    id: "UC02-E-02",
    useCase: "UC02",
    flow: "异常流程",
    scenario: "学生越权创建课程",
    expected: "HTTP 403",
    actual: `HTTP ${studentCreate.status}`,
    passed: studentCreate.status === 403,
    evidence: studentCreate.json,
  });

  const invalid = await api("UC02-invalid-create-body", "POST", "/courses", {
    token: tokens.teacher,
    body: { title: "", courseCode: `${courseCode}X` },
  });
  addCase({
    id: "UC02-E-03",
    useCase: "UC02",
    flow: "异常流程",
    scenario: "课程标题为空",
    expected: "HTTP 400",
    actual: `HTTP ${invalid.status}`,
    passed: invalid.status === 400,
    evidence: invalid.json,
  });
}

async function runUc01() {
  if (!testCourseId) return;
  await ensureEnrollmentWindowOpen();

  const enrolled = await api("UC01-enroll", "POST", `/enrollment/courses/${testCourseId}/enroll`, {
    token: tokens.student,
    body: {},
  });
  const dashboard = await api("UC01-dashboard-after-enroll", "GET", "/dashboard/me", {
    token: tokens.student,
  });
  const dashboardCourse = (dashboard.json?.courses ?? []).find((course) => course.id === testCourseId);
  addCase({
    id: "UC01-M-01",
    useCase: "UC01",
    flow: "主流程",
    scenario: "学生选课后同步到个人课表",
    expected: "选课 HTTP 200，dashboard 包含课程和课表时段",
    actual: `选课 HTTP ${enrolled.status}，dashboard ${dashboardCourse ? "已包含" : "未包含"}课程`,
    passed: enrolled.status === 200 && !!dashboardCourse && (dashboardCourse.scheduleSlots?.length ?? 0) > 0,
    evidence: { enrollment: enrolled.json, dashboardCourse },
  });

  const duplicate = await api("UC01-duplicate-enroll", "POST", `/enrollment/courses/${testCourseId}/enroll`, {
    token: tokens.student,
    body: {},
  });
  addCase({
    id: "UC01-E-01",
    useCase: "UC01",
    flow: "异常流程",
    scenario: "重复选同一门课程",
    expected: "HTTP 409",
    actual: `HTTP ${duplicate.status}：${duplicate.json?.error ?? ""}`,
    passed: duplicate.status === 409,
    evidence: duplicate.json,
  });

  const dropped = await api("UC01-drop", "DELETE", `/enrollment/courses/${testCourseId}/enroll`, {
    token: tokens.student,
  });
  const dashboardAfterDrop = await api("UC01-dashboard-after-drop", "GET", "/dashboard/me", {
    token: tokens.student,
  });
  const stillPresent = (dashboardAfterDrop.json?.courses ?? []).some((course) => course.id === testCourseId);
  addCase({
    id: "UC01-M-02",
    useCase: "UC01",
    flow: "主流程",
    scenario: "学生退课后从个人课表移除",
    expected: "退课 HTTP 200，dashboard 不再包含课程",
    actual: `退课 HTTP ${dropped.status}，dashboard ${stillPresent ? "仍包含" : "已移除"}课程`,
    passed: dropped.status === 200 && !stillPresent,
    evidence: { drop: dropped.json },
  });

  const repeatedDrop = await api("UC01-repeat-drop", "DELETE", `/enrollment/courses/${testCourseId}/enroll`, {
    token: tokens.student,
  });
  addCase({
    id: "UC01-E-02",
    useCase: "UC01",
    flow: "异常流程",
    scenario: "未选课程时再次退课",
    expected: "HTTP 404",
    actual: `HTTP ${repeatedDrop.status}：${repeatedDrop.json?.error ?? ""}`,
    passed: repeatedDrop.status === 404,
    evidence: repeatedDrop.json,
  });

  await api("UC01-preclean-waitlist", "DELETE", `/enrollment/courses/${fullCourseId}/waitlist`, {
    token: tokens.fixtureStudent,
    record: false,
  });
  const fullEnroll = await api("UC01-full-course-enroll", "POST", `/enrollment/courses/${fullCourseId}/enroll`, {
    token: tokens.fixtureStudent,
    body: {},
  });
  const waitlisted = await api("UC01-join-waitlist", "POST", `/enrollment/courses/${fullCourseId}/waitlist`, {
    token: tokens.fixtureStudent,
    body: {},
  });
  addCase({
    id: "UC01-M-03",
    useCase: "UC01",
    flow: "主流程",
    scenario: "课程已满时加入候补",
    expected: "直接选课 HTTP 409，加入候补 HTTP 200",
    actual: `直接选课 HTTP ${fullEnroll.status}，加入候补 HTTP ${waitlisted.status}`,
    passed: fullEnroll.status === 409 && waitlisted.status === 200,
    evidence: { fullEnroll: fullEnroll.json, waitlist: waitlisted.json },
  });

  const duplicateWaitlist = await api("UC01-duplicate-waitlist", "POST", `/enrollment/courses/${fullCourseId}/waitlist`, {
    token: tokens.fixtureStudent,
    body: {},
  });
  addCase({
    id: "UC01-E-03",
    useCase: "UC01",
    flow: "异常流程",
    scenario: "重复加入候补",
    expected: "HTTP 409",
    actual: `HTTP ${duplicateWaitlist.status}：${duplicateWaitlist.json?.error ?? ""}`,
    passed: duplicateWaitlist.status === 409,
    evidence: duplicateWaitlist.json,
  });
  await api("UC01-leave-waitlist", "DELETE", `/enrollment/courses/${fullCourseId}/waitlist`, {
    token: tokens.fixtureStudent,
  });

  // Re-enroll for UC03/UC04 course access; cleaned up at the end.
  await api("shared-reenroll-for-UC03-UC04", "POST", `/enrollment/courses/${testCourseId}/enroll`, {
    token: tokens.student,
    body: {},
  });
}

async function runUc03() {
  if (!testCourseId) return;
  const title = `D1验证公告-${runId}`;
  const created = await api("UC03-publish-announcement", "POST", `/courses/${testCourseId}/announcements`, {
    token: tokens.teacher,
    body: { title, content: "UC03 公告正文", pinned: false },
  });
  announcementId = created.json?.announcement?.id ?? null;
  const listBefore = await api("UC03-list-before-read", "GET", `/courses/${testCourseId}/announcements`, {
    token: tokens.student,
  });
  const before = (listBefore.json?.announcements ?? []).find((item) => item.id === announcementId);
  addCase({
    id: "UC03-M-01",
    useCase: "UC03",
    flow: "主流程",
    scenario: "教师发布公告，学生公告列表可见",
    expected: "发布 HTTP 200，学生列表包含公告且 read=false",
    actual: `发布 HTTP ${created.status}，列表${before ? "包含" : "不包含"}公告，read=${String(before?.read)}`,
    passed: created.status === 200 && !!before && before.read === false,
    evidence: { announcement: created.json?.announcement, studentListItem: before },
  });

  let detail = { status: 0, json: null };
  let listAfter = { json: null };
  if (announcementId) {
    detail = await api(
      "UC03-read-announcement",
      "GET",
      `/courses/${testCourseId}/announcements/${announcementId}`,
      { token: tokens.student },
    );
    listAfter = await api("UC03-list-after-read", "GET", `/courses/${testCourseId}/announcements`, {
      token: tokens.student,
    });
  }
  const after = (listAfter.json?.announcements ?? []).find((item) => item.id === announcementId);
  addCase({
    id: "UC03-M-02",
    useCase: "UC03",
    flow: "主流程",
    scenario: "学生阅读公告并形成已读记录",
    expected: "详情 HTTP 200，随后列表 read=true",
    actual: `详情 HTTP ${detail.status}，随后 read=${String(after?.read)}`,
    passed: detail.status === 200 && detail.json?.announcement?.read === true && after?.read === true,
    evidence: { detail: detail.json?.announcement, listItemAfterRead: after },
  });

  const studentPublish = await api("UC03-student-publish-forbidden", "POST", `/courses/${testCourseId}/announcements`, {
    token: tokens.student,
    body: { title: "越权公告", content: "不应创建" },
  });
  addCase({
    id: "UC03-E-01",
    useCase: "UC03",
    flow: "异常流程",
    scenario: "学生越权发布公告",
    expected: "HTTP 403",
    actual: `HTTP ${studentPublish.status}`,
    passed: studentPublish.status === 403,
    evidence: studentPublish.json,
  });

  const invalid = await api("UC03-empty-content", "POST", `/courses/${testCourseId}/announcements`, {
    token: tokens.teacher,
    body: { title: "空正文", content: "" },
  });
  addCase({
    id: "UC03-E-02",
    useCase: "UC03",
    flow: "异常流程",
    scenario: "公告正文为空",
    expected: "HTTP 400",
    actual: `HTTP ${invalid.status}`,
    passed: invalid.status === 400,
    evidence: invalid.json,
  });

  const outsider = await api("UC03-outsider-list-forbidden", "GET", `/courses/${testCourseId}/announcements`, {
    token: tokens.fixtureStudent,
  });
  addCase({
    id: "UC03-E-03",
    useCase: "UC03",
    flow: "异常流程",
    scenario: "未选课学生查看课程公告",
    expected: "HTTP 403",
    actual: `HTTP ${outsider.status}`,
    passed: outsider.status === 403,
    evidence: outsider.json,
  });
}

function materialForm({ content = materialText, name = `uc04-${runId}.txt`, title = `UC04验证资料-${runId}` } = {}) {
  const form = new FormData();
  form.append("file", new Blob([content], { type: "text/plain" }), name);
  form.append("title", title);
  form.append("folderPath", "D1验证");
  form.append("visibility", "ALL");
  form.append("notify", "false");
  return form;
}

async function runUc04() {
  if (!testCourseId) return;
  const uploaded = await api("UC04-upload-material", "POST", `/courses/${testCourseId}/materials`, {
    token: tokens.teacher,
    form: materialForm(),
  });
  materialId = uploaded.json?.materials?.[0]?.id ?? null;
  const listed = await api("UC04-list-materials", "GET", `/courses/${testCourseId}/materials`, {
    token: tokens.student,
  });
  const listItem = (listed.json?.materials ?? []).find((item) => item.id === materialId);
  addCase({
    id: "UC04-M-01",
    useCase: "UC04",
    flow: "主流程",
    scenario: "教师上传资料，学生浏览资料列表",
    expected: "上传 HTTP 200，学生列表包含资料",
    actual: `上传 HTTP ${uploaded.status}，列表${listItem ? "包含" : "不包含"}资料`,
    passed: uploaded.status === 200 && !!listItem,
    evidence: { uploaded: uploaded.json?.materials?.[0], studentListItem: listItem },
  });

  let favorite = { status: 0, json: null };
  let favorites = { json: null };
  let download = { status: 0, text: "", bytes: 0 };
  if (materialId) {
    favorite = await api(
      "UC04-favorite-material",
      "POST",
      `/courses/${testCourseId}/materials/${materialId}/favorite`,
      { token: tokens.student, body: {} },
    );
    favorites = await api("UC04-list-favorites", "GET", `/courses/${testCourseId}/materials/favorites`, {
      token: tokens.student,
    });
    download = await api(
      "UC04-download-material",
      "GET",
      `/courses/${testCourseId}/materials/${materialId}/download`,
      { token: tokens.student },
    );
  }
  const favoriteVisible = (favorites.json?.materials ?? []).some((item) => item.id === materialId);
  addCase({
    id: "UC04-M-02",
    useCase: "UC04",
    flow: "主流程",
    scenario: "学生收藏资料并在收藏列表查看",
    expected: "收藏 HTTP 200，收藏列表包含资料",
    actual: `收藏 HTTP ${favorite.status}，收藏列表${favoriteVisible ? "包含" : "不包含"}资料`,
    passed: favorite.status === 200 && favoriteVisible,
    evidence: { favorite: favorite.json, favoriteCount: favorites.json?.materials?.length ?? null },
  });
  addCase({
    id: "UC04-M-03",
    useCase: "UC04",
    flow: "主流程",
    scenario: "学生下载课程资料",
    expected: "HTTP 200，下载内容与上传内容一致",
    actual: `HTTP ${download.status}，${download.bytes} bytes，内容${download.text === materialText ? "一致" : "不一致"}`,
    passed: download.status === 200 && download.text === materialText,
    evidence: { bytes: download.bytes, contentType: download.headers?.contentType },
  });

  const studentUpload = await api("UC04-student-upload-forbidden", "POST", `/courses/${testCourseId}/materials`, {
    token: tokens.student,
    form: materialForm({ name: `forbidden-${runId}.txt`, title: "越权上传" }),
  });
  addCase({
    id: "UC04-E-01",
    useCase: "UC04",
    flow: "异常流程",
    scenario: "学生越权上传课程资料",
    expected: "HTTP 403",
    actual: `HTTP ${studentUpload.status}`,
    passed: studentUpload.status === 403,
    evidence: studentUpload.json,
  });

  const outsider = await api("UC04-outsider-list-forbidden", "GET", `/courses/${testCourseId}/materials`, {
    token: tokens.fixtureStudent,
  });
  addCase({
    id: "UC04-E-02",
    useCase: "UC04",
    flow: "异常流程",
    scenario: "未选课学生浏览课程资料",
    expected: "HTTP 403",
    actual: `HTTP ${outsider.status}`,
    passed: outsider.status === 403,
    evidence: outsider.json,
  });

  const missingId = "00000000-0000-4000-8000-000000000404";
  const missing = await api(
    "UC04-missing-material-download",
    "GET",
    `/courses/${testCourseId}/materials/${missingId}/download`,
    { token: tokens.student },
  );
  addCase({
    id: "UC04-E-03",
    useCase: "UC04",
    flow: "异常流程",
    scenario: "下载不存在的资料",
    expected: "HTTP 404",
    actual: `HTTP ${missing.status}`,
    passed: missing.status === 404,
    evidence: missing.json,
  });
}

async function getCourseDomainTableCounts() {
  return {
    User: await prisma.user.count(),
    Course: await prisma.course.count(),
    Class: await prisma.class.count(),
    Enrollment: await prisma.enrollment.count(),
    EnrollmentWaitlist: await prisma.enrollmentWaitlist.count(),
    EnrollmentLog: await prisma.enrollmentLog.count(),
    EnrollmentPeriod: await prisma.enrollmentPeriod.count(),
    TimetableConfirmation: await prisma.timetableConfirmation.count(),
    CourseAnnouncement: await prisma.courseAnnouncement.count(),
    AnnouncementRead: await prisma.announcementRead.count(),
    AnnouncementMark: await prisma.announcementMark.count(),
    CourseMaterial: await prisma.courseMaterial.count(),
    MaterialFavorite: await prisma.materialFavorite.count(),
    SiteNotification: await prisma.siteNotification.count(),
  };
}

async function collectDatabaseEvidence() {
  const counts = await getCourseDomainTableCounts();
  const enumRows = await prisma.$queryRawUnsafe(
    `SELECT e.enumlabel AS value
       FROM pg_type t
       JOIN pg_enum e ON t.oid = e.enumtypid
      WHERE t.typname = 'EnrollmentLogAction'
      ORDER BY e.enumsortorder`,
  );
  report.database = {
    capturedAt: new Date().toISOString(),
    tableCountsDuringVerification: counts,
    enrollmentLogActionValuesInDatabase: enumRows.map((row) => row.value),
    schemaRequiresCourseCreate: true,
    databaseHasCourseCreate: enumRows.some((row) => row.value === "COURSE_CREATE"),
  };
}

async function cleanup() {
  if (testCourseId) {
    try {
      await prisma.siteNotification.deleteMany({
        where: {
          createdAt: { gte: runStarted },
          OR: [
            { linkPath: { contains: testCourseId } },
            ...(announcementId ? [{ announcementId }] : []),
            ...(materialId ? [{ materialId }] : []),
          ],
        },
      });
      report.cleanup.push({ item: "本次用例产生的站内通知", result: "已清理" });
    } catch (error) {
      report.cleanup.push({ item: "本次用例产生的站内通知", result: "清理失败", error: String(error) });
    }
  }

  if (materialId && testCourseId) {
    const unfavorite = await api(
      "cleanup-unfavorite",
      "DELETE",
      `/courses/${testCourseId}/materials/${materialId}/favorite`,
      { token: tokens.student, record: false },
    );
    const removed = await api(
      "cleanup-material",
      "DELETE",
      `/courses/${testCourseId}/materials/${materialId}`,
      { token: tokens.teacher, record: false },
    );
    report.cleanup.push({
      item: `临时资料 ${materialId}`,
      result: removed.status === 200 ? "已删除（含上传文件）" : `删除失败 HTTP ${removed.status}`,
      unfavoriteStatus: unfavorite.status,
    });
  }

  if (announcementId) {
    const removed = await api("cleanup-announcement", "DELETE", `/announcements/${announcementId}`, {
      token: tokens.teacher,
      record: false,
    });
    report.cleanup.push({
      item: `临时公告 ${announcementId}`,
      result: removed.status === 200 ? "已删除" : `删除失败 HTTP ${removed.status}`,
    });
  }

  if (testCourseId) {
    await api("cleanup-enrollment", "DELETE", `/enrollment/courses/${testCourseId}/enroll`, {
      token: tokens.student,
      record: false,
    });
    try {
      const deleted = await prisma.course.deleteMany({ where: { id: testCourseId, courseCode } });
      report.cleanup.push({
        item: `临时课程 ${testCourseId}`,
        result: deleted.count === 1 ? "已从数据库删除" : "未删除（未匹配临时课程代码）",
      });
    } catch (error) {
      report.cleanup.push({ item: `临时课程 ${testCourseId}`, result: "清理失败", error: String(error) });
    }
  }

  if (periodChanged && periodSnapshot) {
    const restored = await api("cleanup-restore-period", "PUT", "/enrollment/period", {
      token: tokens.admin,
      record: false,
      body: {
        label: periodSnapshot.label ?? undefined,
        phase: periodSnapshot.phase,
        openAt: periodSnapshot.openAt,
        closeAt: periodSnapshot.closeAt,
        confirmDeadline: periodSnapshot.confirmDeadline,
      },
    });
    report.cleanup.push({
      item: "选课时段配置",
      result: restored.status === 200 ? "已恢复" : `恢复失败 HTTP ${restored.status}`,
    });
  }

  try {
    report.database.tableCountsAfterCleanup = await getCourseDomainTableCounts();
  } catch (error) {
    report.cleanup.push({ item: "清理后数据表计数", result: "采集失败", error: String(error) });
  }
}

async function main() {
  await mkdir(evidenceDir, { recursive: true });
  const health = await api("health-ready", "GET", "/health/ready");
  report.preconditions.push({
    item: "API 与数据库就绪",
    expected: "GET /health/ready 返回 HTTP 200、ok=true",
    actual: `HTTP ${health.status}，ok=${String(health.json?.ok)}`,
    result: health.status === 200 && health.json?.ok === true ? "通过" : "失败",
  });
  await login("teacher", "teacher@demo.local");
  await login("student", "student20@demo.local");
  await login("fixtureStudent", "student@demo.local");
  await login("admin", "admin@demo.local");

  if (report.preconditions.some((item) => item.result === "失败")) {
    throw new Error("前置条件不满足，停止业务用例验证");
  }

  await runUc02();
  await runUc01();
  await runUc03();
  await runUc04();
  await collectDatabaseEvidence();
}

let fatalError = null;
try {
  await main();
} catch (error) {
  fatalError = String(error?.stack ?? error);
  report.fatalError = fatalError;
} finally {
  try {
    await cleanup();
  } catch (error) {
    report.cleanup.push({ item: "总清理流程", result: "失败", error: String(error) });
  }
  report.metadata.finishedAt = new Date().toISOString();
  report.summary = {
    total: report.cases.length,
    passed: report.cases.filter((item) => item.result === "通过").length,
    failed: report.cases.filter((item) => item.result === "失败").length,
  };
  await writeFile(
    resolve(evidenceDir, "uc01-uc04-api-results.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    resolve(evidenceDir, "course-domain-table-counts.json"),
    `${JSON.stringify(report.database, null, 2)}\n`,
    "utf8",
  );
  await prisma.$disconnect();
}

console.log(JSON.stringify({
  summary: report.summary,
  failedCases: report.cases.filter((item) => item.result === "失败").map((item) => ({
    id: item.id,
    actual: item.actual,
  })),
  databaseHasCourseCreate: report.database.databaseHasCourseCreate,
  cleanup: report.cleanup,
  evidence: resolve(evidenceDir, "uc01-uc04-api-results.json"),
  fatalError,
}, null, 2));

if (fatalError) process.exitCode = 1;
