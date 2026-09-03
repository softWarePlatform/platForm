import "dotenv/config";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { prisma } from "../lib/prisma.js";
import { UPLOAD_ROOT } from "../lib/uploads.js";

type Flow = "主流程" | "备选流程" | "异常流程";
type CaseResult = {
  uc: "UC01" | "UC02" | "UC03" | "UC04" | "SETUP";
  id: string;
  flow: Flow;
  description: string;
  passed: boolean;
  detail: string;
  durationMs: number;
};

type ApiResult = {
  status: number;
  json: any;
  text: string;
  bytes: Uint8Array;
  headers: Headers;
};

const API_BASE_URL = (process.env.API_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const REPORT_PATH = process.env.UC_REPORT_PATH
  ? resolve(process.env.UC_REPORT_PATH)
  : resolve(process.cwd(), "..", "test-results", "uc01-04.json");
const TEST_PREFIX = "[UC27-AUTO]";
const PASSWORD = "Demo123456";
const startedAt = new Date();
const runId = `${Date.now()}-${process.pid}`;
const courseCode = `U27${Date.now().toString().slice(-9)}`;
const materialContent = `UC04 material ${runId}\n`;

const results: CaseResult[] = [];
let courseId: string | null = null;
let announcementId: string | null = null;
let materialId: string | null = null;
let semesterKey: string | null = null;
let originalPeriod: any = null;
let teacherToken = "";
let otherTeacherToken = "";
let studentToken = "";
let secondStudentToken = "";
let adminToken = "";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function api(
  method: string,
  path: string,
  options: { token?: string; body?: unknown; form?: FormData } = {},
): Promise<ApiResult> {
  const headers = new Headers();
  if (options.token) headers.set("Authorization", `Bearer ${options.token}`);

  let body: BodyInit | undefined;
  if (options.form) {
    body = options.form;
  } else if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(options.body);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, { method, headers, body });
  const buffer = new Uint8Array(await response.arrayBuffer());
  const text = new TextDecoder().decode(buffer);
  let json: any = null;
  if ((response.headers.get("content-type") ?? "").includes("application/json")) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  return { status: response.status, json, text, bytes: buffer, headers: response.headers };
}

function expectStatus(response: ApiResult, expected: number, operation: string) {
  assert(
    response.status === expected,
    `${operation}: 期望 HTTP ${expected}，实际 ${response.status}，响应 ${response.text.slice(0, 300)}`,
  );
}

async function runCase(
  uc: CaseResult["uc"],
  id: string,
  flow: Flow,
  description: string,
  test: () => Promise<string | void>,
) {
  const begin = Date.now();
  try {
    const detail = await test();
    results.push({
      uc,
      id,
      flow,
      description,
      passed: true,
      detail: detail ?? "断言通过",
      durationMs: Date.now() - begin,
    });
  } catch (error) {
    results.push({
      uc,
      id,
      flow,
      description,
      passed: false,
      detail: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - begin,
    });
  }
}

async function login(email: string) {
  const response = await api("POST", "/auth/login", {
    body: { email, password: PASSWORD },
  });
  expectStatus(response, 200, `${email} 登录`);
  assert(typeof response.json?.token === "string", `${email} 登录响应缺少 token`);
  return response.json.token as string;
}

function periodBody(period: any) {
  return {
    label: period.label ?? undefined,
    phase: period.phase,
    openAt: period.openAt,
    closeAt: period.closeAt,
    confirmDeadline: period.confirmDeadline ?? null,
  };
}

async function setOpenPeriod() {
  const response = await api("PUT", "/enrollment/period", {
    token: adminToken,
    body: {
      label: "UC01—UC04 自动化测试窗口",
      phase: "FORMAL",
      openAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      closeAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      confirmDeadline: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    },
  });
  expectStatus(response, 200, "打开测试选课窗口");
}

async function removeStoredFilesForCourses(ids: string[]) {
  if (ids.length === 0) return;
  const materials = await prisma.courseMaterial.findMany({
    where: { courseId: { in: ids } },
    select: { storedPath: true },
  });
  for (const material of materials) {
    const absolute = join(UPLOAD_ROOT, ...material.storedPath.split("/").filter(Boolean));
    await unlink(absolute).catch(() => undefined);
  }
}

async function removeStaleTestData() {
  const stale = await prisma.course.findMany({
    where: { title: { startsWith: TEST_PREFIX } },
    select: { id: true },
  });
  const ids = stale.map((row) => row.id);
  await removeStoredFilesForCourses(ids);
  if (ids.length > 0) {
    await prisma.siteNotification.deleteMany({
      where: {
        OR: [
          { linkPath: { in: ids.map((id) => `/teacher/courses/${id}/manage`) } },
          { linkPath: { in: ids.map((id) => `/courses/${id}/announcements`) } },
          { linkPath: { in: ids.map((id) => `/courses/${id}/materials`) } },
        ],
      },
    });
    await prisma.course.deleteMany({ where: { id: { in: ids } } });
  }
}

async function cleanup() {
  if (courseId) {
    await removeStoredFilesForCourses([courseId]);
    await prisma.siteNotification.deleteMany({
      where: {
        createdAt: { gte: startedAt },
        OR: [
          { announcementId: announcementId ?? undefined },
          { materialId: materialId ?? undefined },
          { linkPath: `/teacher/courses/${courseId}/manage` },
          { linkPath: `/courses/${courseId}/announcements` },
          { linkPath: `/courses/${courseId}/materials` },
        ],
      },
    });
    await prisma.course.deleteMany({ where: { id: courseId } });
  }

  if (semesterKey) {
    if (originalPeriod) {
      const restored = await api("PUT", "/enrollment/period", {
        token: adminToken,
        body: periodBody(originalPeriod),
      });
      expectStatus(restored, 200, "恢复原选课窗口");
    } else {
      await prisma.enrollmentPeriod.deleteMany({ where: { semesterKey } });
    }
  }
}

async function prepare() {
  const health = await api("GET", "/health/ready");
  expectStatus(health, 200, "API 就绪检查");

  [teacherToken, otherTeacherToken, studentToken, secondStudentToken, adminToken] =
    await Promise.all([
      login("teacher@demo.local"),
      login("teacher2@demo.local"),
      login("student@demo.local"),
      login("student02@demo.local"),
      login("admin@demo.local"),
    ]);

  await removeStaleTestData();
  const period = await api("GET", "/enrollment/period", { token: adminToken });
  expectStatus(period, 200, "读取原选课窗口");
  originalPeriod = period.json?.period ?? null;
  semesterKey = period.json?.semester?.key ?? originalPeriod?.semesterKey ?? null;
  assert(semesterKey, "无法确定当前学期 semesterKey");
  await setOpenPeriod();
}

async function executeCases() {
  await runCase("UC02", "UC02-M01", "主流程", "教师创建未发布课程并写入创建日志", async () => {
    const response = await api("POST", "/courses", {
      token: teacherToken,
      body: {
        title: `${TEST_PREFIX} 软件工程验收课 ${runId}`,
        description: "用于 2026-8-27 UC01—UC04 自动化验收",
        category: "软件工程",
        published: false,
        courseCode,
        credits: 2,
        capacity: 1,
        courseNature: "ELECTIVE",
        subjectCategory: "GENERAL_MAJOR",
        offeringCollegeCode: "SE",
        semesterKey,
        scheduleSlots: [{ dayOfWeek: 5, periodStart: 7, periodEnd: 8, room: "自动化测试教室" }],
      },
    });
    expectStatus(response, 200, "创建课程");
    courseId = response.json?.course?.id ?? null;
    assert(courseId, "创建课程响应缺少 course.id");
    const [course, log] = await Promise.all([
      prisma.course.findUnique({ where: { id: courseId } }),
      prisma.enrollmentLog.findFirst({ where: { courseId, action: "COURSE_CREATE" } }),
    ]);
    assert(course?.published === false, "数据库中的课程应为未发布状态");
    assert(log, "数据库中缺少 COURSE_CREATE 日志");
    const hidden = await api("GET", `/courses/${courseId}`);
    expectStatus(hidden, 404, "学生侧查看未发布课程");
    return `courseId=${courseId}，未发布且创建日志存在`;
  });

  await runCase("UC02", "UC02-M02", "主流程", "教师配置并发布课程", async () => {
    assert(courseId, "依赖的测试课程未创建");
    const response = await api("PATCH", `/courses/${courseId}`, {
      token: teacherToken,
      body: {
        description: "课程配置已完成并发布",
        published: true,
        capacity: 1,
        credits: 3,
        scheduleSlots: [{ dayOfWeek: 5, periodStart: 7, periodEnd: 9, room: "A-527" }],
      },
    });
    expectStatus(response, 200, "配置并发布课程");
    assert(response.json?.course?.published === true, "发布响应中的 published 不是 true");
    assert(response.json?.course?.credits === 3, "课程学分没有更新为 3");
    assert(response.json?.course?.scheduleSlots?.[0]?.room === "A-527", "课表配置未生效");
    const publicDetail = await api("GET", `/courses/${courseId}`);
    expectStatus(publicDetail, 200, "公开查看已发布课程");
    const stored = await prisma.course.findUnique({ where: { id: courseId } });
    assert(stored?.published === true && stored.credits === 3, "数据库中的发布或配置状态不正确");
    return "配置、发布、公开可见及数据库状态均正确";
  });

  await runCase("UC02", "UC02-A01", "备选流程", "重复课程代码被拒绝", async () => {
    const response = await api("POST", "/courses", {
      token: otherTeacherToken,
      body: { title: `${TEST_PREFIX} 重复代码`, courseCode, published: false },
    });
    expectStatus(response, 409, "重复课程代码创建");
    return "HTTP 409，未生成重复课程";
  });

  await runCase("UC02", "UC02-E01", "异常流程", "角色、课程归属和参数校验", async () => {
    assert(courseId, "依赖的测试课程未创建");
    const studentCreate = await api("POST", "/courses", {
      token: studentToken,
      body: { title: "学生越权创建" },
    });
    const otherTeacherPatch = await api("PATCH", `/courses/${courseId}`, {
      token: otherTeacherToken,
      body: { title: "越权修改" },
    });
    const invalid = await api("PATCH", `/courses/${courseId}`, {
      token: teacherToken,
      body: { credits: 0 },
    });
    expectStatus(studentCreate, 403, "学生创建课程");
    expectStatus(otherTeacherPatch, 403, "其他教师修改课程");
    expectStatus(invalid, 400, "非法课程参数");
    return "学生 403、非任课教师 403、非法参数 400";
  });

  await runCase("UC01", "UC01-M01", "主流程", "学生选课并同步个人课表", async () => {
    assert(courseId, "依赖的测试课程未创建");
    const enroll = await api("POST", `/enrollment/courses/${courseId}/enroll`, {
      token: studentToken,
      body: {},
    });
    expectStatus(enroll, 200, "学生选课");
    const dashboard = await api("GET", "/dashboard/me", { token: studentToken });
    expectStatus(dashboard, 200, "读取个人课表");
    const row = (dashboard.json?.courses ?? []).find((item: any) => item.id === courseId);
    assert(row, "选课后个人课表没有出现测试课程");
    assert(row.scheduleSlots?.[0]?.room === "A-527", "个人课表没有同步课程时段配置");
    const stored = await prisma.enrollment.findUnique({
      where: { userId_courseId: { userId: enroll.json.enrollment.userId, courseId } },
    });
    assert(stored, "数据库中缺少选课记录");
    return "选课记录、个人课表及课程时段同步成功";
  });

  await runCase("UC01", "UC01-A01", "备选流程", "满员候补并在退课后自动递补", async () => {
    assert(courseId, "依赖的测试课程未创建");
    const full = await api("POST", `/enrollment/courses/${courseId}/enroll`, {
      token: secondStudentToken,
      body: {},
    });
    expectStatus(full, 409, "满员课程直接选课");
    const wait = await api("POST", `/enrollment/courses/${courseId}/waitlist`, {
      token: secondStudentToken,
    });
    expectStatus(wait, 200, "加入候补");
    const waitRow = await prisma.enrollmentWaitlist.findFirst({ where: { courseId } });
    assert(waitRow, "数据库中缺少候补记录");

    const firstEnrollment = await prisma.enrollment.findFirst({ where: { courseId } });
    assert(firstEnrollment, "用于退课的选课记录不存在");
    const drop = await api("DELETE", `/enrollment/courses/${courseId}/enroll`, {
      token: studentToken,
    });
    expectStatus(drop, 200, "原学生退课");

    const promoted = await prisma.enrollment.findUnique({
      where: { userId_courseId: { userId: waitRow.userId, courseId } },
    });
    const remainingWait = await prisma.enrollmentWaitlist.findUnique({
      where: { userId_courseId: { userId: waitRow.userId, courseId } },
    });
    assert(promoted, "退课后候补学生未自动递补");
    assert(!remainingWait, "递补后候补记录未删除");

    const [firstDashboard, secondDashboard] = await Promise.all([
      api("GET", "/dashboard/me", { token: studentToken }),
      api("GET", "/dashboard/me", { token: secondStudentToken }),
    ]);
    const firstHas = (firstDashboard.json?.courses ?? []).some((item: any) => item.id === courseId);
    const secondHas = (secondDashboard.json?.courses ?? []).some((item: any) => item.id === courseId);
    assert(!firstHas && secondHas, "退课与候补递补没有正确同步双方课表");
    return "满员 409、候补成功、退课后自动递补并同步双方课表";
  });

  await runCase("UC01", "UC01-E01", "异常流程", "重复选课、已选课程候补和教师越权", async () => {
    assert(courseId, "依赖的测试课程未创建");
    const duplicate = await api("POST", `/enrollment/courses/${courseId}/enroll`, {
      token: secondStudentToken,
      body: {},
    });
    const enrolledWaitlist = await api("POST", `/enrollment/courses/${courseId}/waitlist`, {
      token: secondStudentToken,
    });
    const teacherEnroll = await api("POST", `/enrollment/courses/${courseId}/enroll`, {
      token: teacherToken,
      body: {},
    });
    expectStatus(duplicate, 409, "重复选课");
    expectStatus(enrolledWaitlist, 409, "已选学生加入候补");
    expectStatus(teacherEnroll, 403, "教师调用学生选课接口");
    return "重复选课 409、已选候补 409、教师越权 403";
  });

  await runCase("UC01", "UC01-E02", "异常流程", "选课窗口关闭时拒绝选课", async () => {
    assert(courseId, "依赖的测试课程未创建");
    const closed = await api("PUT", "/enrollment/period", {
      token: adminToken,
      body: {
        label: "UC01 关闭窗口测试",
        phase: "CLOSED",
        openAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        closeAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        confirmDeadline: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
      },
    });
    expectStatus(closed, 200, "关闭选课窗口");
    const blocked = await api("POST", `/enrollment/courses/${courseId}/enroll`, {
      token: studentToken,
      body: {},
    });
    expectStatus(blocked, 403, "关闭窗口后选课");
    await setOpenPeriod();
    return "窗口关闭后 HTTP 403，测试结束已重新开放测试窗口";
  });

  await runCase("UC03", "UC03-M01", "主流程", "教师发布公告，学生列表可见", async () => {
    assert(courseId, "依赖的测试课程未创建");
    const response = await api("POST", `/courses/${courseId}/announcements`, {
      token: teacherToken,
      body: { title: `${TEST_PREFIX} 公告 ${runId}`, content: "请按时完成课程任务。", pinned: false },
    });
    expectStatus(response, 200, "教师发布公告");
    announcementId = response.json?.announcement?.id ?? null;
    assert(announcementId, "发布公告响应缺少 announcement.id");
    const list = await api("GET", `/courses/${courseId}/announcements`, {
      token: secondStudentToken,
    });
    expectStatus(list, 200, "学生浏览公告列表");
    const row = (list.json?.announcements ?? []).find((item: any) => item.id === announcementId);
    assert(row, "学生公告列表中缺少新公告");
    assert(row.read === false, "首次浏览列表前公告应为未读");
    return `announcementId=${announcementId}，学生列表显示未读`;
  });

  await runCase("UC03", "UC03-M02", "主流程", "学生阅读公告并形成唯一已读记录", async () => {
    assert(courseId && announcementId, "依赖的测试课程或公告未创建");
    const firstRead = await api("GET", `/courses/${courseId}/announcements/${announcementId}`, {
      token: secondStudentToken,
    });
    expectStatus(firstRead, 200, "学生阅读公告");
    assert(firstRead.json?.announcement?.read === true, "阅读公告后 read 未变为 true");
    const readerId = (
      await prisma.enrollment.findFirstOrThrow({ where: { courseId }, select: { userId: true } })
    ).userId;
    const firstCount = await prisma.announcementRead.count({
      where: { announcementId, userId: readerId },
    });
    assert(firstCount === 1, `已读记录应为 1 条，实际 ${firstCount}`);
    await api("GET", `/courses/${courseId}/announcements/${announcementId}`, {
      token: secondStudentToken,
    });
    const secondCount = await prisma.announcementRead.count({
      where: { announcementId, userId: readerId },
    });
    assert(secondCount === 1, `重复阅读后已读记录应保持 1 条，实际 ${secondCount}`);
    return "首次阅读生成 1 条记录，重复阅读保持唯一";
  });

  await runCase("UC03", "UC03-A01", "备选流程", "学生切换未读再重新阅读", async () => {
    assert(announcementId, "依赖的测试公告未创建");
    const unread = await api("POST", `/announcements/${announcementId}/read-status`, {
      token: secondStudentToken,
      body: { read: false },
    });
    expectStatus(unread, 200, "标记未读");
    const noRead = await prisma.announcementRead.count({ where: { announcementId } });
    assert(noRead === 0, `标记未读后记录应删除，实际 ${noRead}`);
    const reread = await api("POST", `/announcements/${announcementId}/read-status`, {
      token: secondStudentToken,
      body: { read: true },
    });
    expectStatus(reread, 200, "重新标记已读");
    const readAgain = await prisma.announcementRead.count({ where: { announcementId } });
    assert(readAgain === 1, `重新标记已读后应有 1 条记录，实际 ${readAgain}`);
    return "未读删除记录，重新阅读恢复唯一记录";
  });

  await runCase("UC03", "UC03-E01", "异常流程", "学生发布、其他教师编辑及非法公告参数被拒绝", async () => {
    assert(courseId && announcementId, "依赖的测试课程或公告未创建");
    const studentPublish = await api("POST", `/courses/${courseId}/announcements`, {
      token: secondStudentToken,
      body: { title: "学生越权公告", content: "禁止" },
    });
    const otherEdit = await api("PATCH", `/announcements/${announcementId}`, {
      token: otherTeacherToken,
      body: { title: "越权编辑" },
    });
    const invalid = await api("POST", `/courses/${courseId}/announcements`, {
      token: teacherToken,
      body: { title: "", content: "" },
    });
    expectStatus(studentPublish, 403, "学生发布公告");
    expectStatus(otherEdit, 403, "其他教师编辑公告");
    expectStatus(invalid, 400, "空公告发布");
    return "学生 403、其他教师 403、非法参数 400";
  });

  await runCase("UC04", "UC04-M01", "主流程", "教师上传资料，学生浏览并预览", async () => {
    assert(courseId, "依赖的测试课程未创建");
    const form = new FormData();
    form.append("file", new Blob([materialContent], { type: "text/plain" }), `uc04-${runId}.txt`);
    form.append("title", `${TEST_PREFIX} 课程资料 ${runId}`);
    form.append("folderPath", "第1章/验收资料");
    form.append("visibility", "ALL");
    form.append("notify", "false");
    const uploaded = await api("POST", `/courses/${courseId}/materials`, {
      token: teacherToken,
      form,
    });
    expectStatus(uploaded, 200, "教师上传资料");
    materialId = uploaded.json?.materials?.[0]?.id ?? null;
    assert(materialId, "上传响应缺少 material.id");
    const list = await api("GET", `/courses/${courseId}/materials`, {
      token: secondStudentToken,
    });
    expectStatus(list, 200, "学生浏览资料");
    const row = (list.json?.materials ?? []).find((item: any) => item.id === materialId);
    assert(row?.previewable === true, "资料未出现在学生列表或不可预览");
    const preview = await api("GET", `/courses/${courseId}/materials/${materialId}/preview`, {
      token: secondStudentToken,
    });
    expectStatus(preview, 200, "学生预览资料");
    assert(preview.text === materialContent, "预览内容与上传内容不一致");
    const stored = await prisma.courseMaterial.findUnique({ where: { id: materialId } });
    assert(stored?.sizeBytes === new TextEncoder().encode(materialContent).length, "数据库资料元数据不正确");
    return `materialId=${materialId}，上传、列表、预览和元数据均正确`;
  });

  await runCase("UC04", "UC04-M02", "主流程", "学生收藏、下载和取消收藏", async () => {
    assert(courseId && materialId, "依赖的测试课程或资料未创建");
    const favorite = await api("POST", `/courses/${courseId}/materials/${materialId}/favorite`, {
      token: secondStudentToken,
    });
    expectStatus(favorite, 200, "收藏资料");
    await api("POST", `/courses/${courseId}/materials/${materialId}/favorite`, {
      token: secondStudentToken,
    });
    const favoriteCount = await prisma.materialFavorite.count({ where: { materialId } });
    assert(favoriteCount === 1, `重复收藏后应只有 1 条记录，实际 ${favoriteCount}`);
    const favoriteList = await api("GET", `/courses/${courseId}/materials/favorites`, {
      token: secondStudentToken,
    });
    assert(
      (favoriteList.json?.materials ?? []).some((item: any) => item.id === materialId),
      "收藏列表中缺少资料",
    );
    const download = await api("GET", `/courses/${courseId}/materials/${materialId}/download`, {
      token: secondStudentToken,
    });
    expectStatus(download, 200, "下载资料");
    assert(download.text === materialContent, "下载内容与上传内容不一致");
    const afterDownload = await prisma.courseMaterial.findUnique({ where: { id: materialId } });
    assert((afterDownload?.downloadCount ?? 0) >= 1, "下载次数没有累加");
    const unfavorite = await api("DELETE", `/courses/${courseId}/materials/${materialId}/favorite`, {
      token: secondStudentToken,
    });
    expectStatus(unfavorite, 200, "取消收藏");
    const afterDelete = await prisma.materialFavorite.count({ where: { materialId } });
    assert(afterDelete === 0, "取消收藏后数据库记录仍存在");
    return "重复收藏保持唯一、下载计数累加、取消收藏删除记录";
  });

  await runCase("UC04", "UC04-A01", "备选流程", "按收藏条件筛选资料", async () => {
    assert(courseId && materialId, "依赖的测试课程或资料未创建");
    await api("POST", `/courses/${courseId}/materials/${materialId}/favorite`, {
      token: secondStudentToken,
    });
    const filtered = await api("GET", `/courses/${courseId}/materials?favorites=1`, {
      token: secondStudentToken,
    });
    expectStatus(filtered, 200, "筛选收藏资料");
    assert(
      filtered.json?.materials?.length === 1 && filtered.json.materials[0].id === materialId,
      "收藏筛选结果不正确",
    );
    return "favorites=1 仅返回已收藏资料";
  });

  await runCase("UC04", "UC04-E01", "异常流程", "学生上传、其他教师删除、空上传及不存在资料被拒绝", async () => {
    assert(courseId && materialId, "依赖的测试课程或资料未创建");
    const studentForm = new FormData();
    studentForm.append("file", new Blob(["forbidden"]), "forbidden.txt");
    const studentUpload = await api("POST", `/courses/${courseId}/materials`, {
      token: secondStudentToken,
      form: studentForm,
    });
    const otherDelete = await api("DELETE", `/courses/${courseId}/materials/${materialId}`, {
      token: otherTeacherToken,
    });
    const emptyForm = new FormData();
    emptyForm.append("title", "没有文件");
    const emptyUpload = await api("POST", `/courses/${courseId}/materials`, {
      token: teacherToken,
      form: emptyForm,
    });
    const missing = await api(
      "GET",
      `/courses/${courseId}/materials/00000000-0000-4000-8000-000000000404/download`,
      { token: secondStudentToken },
    );
    expectStatus(studentUpload, 403, "学生上传资料");
    expectStatus(otherDelete, 403, "其他教师删除资料");
    expectStatus(emptyUpload, 400, "未携带文件上传");
    expectStatus(missing, 404, "下载不存在资料");
    return "学生 403、其他教师 403、空上传 400、不存在资料 404";
  });
}

async function writeReport(cleanupError?: string) {
  const passed = results.filter((item) => item.passed).length;
  const failed = results.length - passed;
  const coverage = ["UC01", "UC02", "UC03", "UC04"].map((uc) => ({
    uc,
    main: results.some((item) => item.uc === uc && item.flow === "主流程" && item.passed),
    alternative: results.some((item) => item.uc === uc && item.flow === "备选流程" && item.passed),
    exception: results.some((item) => item.uc === uc && item.flow === "异常流程" && item.passed),
  }));
  const report = {
    generatedAt: new Date().toISOString(),
    apiBaseUrl: API_BASE_URL,
    runId,
    summary: { total: results.length, passed, failed, cleanupError: cleanupError ?? null },
    coverage,
    results,
  };
  await mkdir(dirname(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  console.log(`\nUC01—UC04 报告：${REPORT_PATH}`);
  return report;
}

async function main() {
  let cleanupError: string | undefined;
  try {
    await prepare();
    await executeCases();
  } catch (error) {
    results.push({
      uc: "SETUP",
      id: "SETUP-001",
      flow: "异常流程",
      description: "准备自动化测试环境",
      passed: false,
      detail: error instanceof Error ? error.message : String(error),
      durationMs: 0,
    });
  } finally {
    try {
      await cleanup();
    } catch (error) {
      cleanupError = error instanceof Error ? error.message : String(error);
    }
    const report = await writeReport(cleanupError);
    await prisma.$disconnect();
    const coverageComplete = report.coverage.every(
      (item) => item.main && item.alternative && item.exception,
    );
    if (report.summary.failed > 0 || cleanupError || !coverageComplete) process.exitCode = 1;
  }
}

void main();
