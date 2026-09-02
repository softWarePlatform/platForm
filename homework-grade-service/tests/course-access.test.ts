import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import http from "node:http";
import test, { afterEach, mock } from "node:test";
import {
  parseInternalAccess,
  resolveCourseAccess,
  teacherAccessDenial,
  viewAccessDenial,
} from "../src/lib/course-client.js";

const courseId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const userId = "11111111-1111-1111-1111-111111111111";
const teacherId = "22222222-2222-2222-2222-222222222222";

afterEach(() => {
  mock.restoreAll();
});

function mockCourse(handler: (url: string, headers: Record<string, string>) => { status: number; body: unknown } | Promise<{ status: number; body: unknown }>) {
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  mock.method(http, "request", (options: http.RequestOptions, callback?: (res: EventEmitter) => void) => {
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(options.headers ?? {})) {
      headers[String(key).toLowerCase()] = String(value);
    }
    const url = `http://${options.hostname}:${options.port}${options.path ?? "/"}`;
    calls.push({ url, headers });
    const req = new EventEmitter() as EventEmitter & { write: () => boolean; end: () => void; destroy: () => void };
    req.write = () => true;
    req.destroy = () => undefined;
    req.end = () => {
      const timer = setTimeout(() => req.emit("timeout"), options.timeout ?? 1000);
      void Promise.resolve(handler(url, headers)).then((result) => {
        clearTimeout(timer);
        const res = new EventEmitter() as EventEmitter & { statusCode: number };
        res.statusCode = result.status;
        callback?.(res);
        queueMicrotask(() => {
          res.emit("data", Buffer.from(JSON.stringify(result.body)));
          res.emit("end");
        });
      });
    };
    return req as unknown as http.ClientRequest;
  });
  return calls;
}

test("解析 A 冻结的 access 包一层对象，不把调用方 role 当作权限", () => {
  const parsed = parseInternalAccess({
    access: {
      userId,
      courseId,
      role: "STUDENT",
      canView: true,
      isTeacher: false,
      isEnrolled: true,
      classId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      classIds: ["cccccccc-cccc-cccc-cccc-cccccccccccc"],
    },
  });
  assert.equal(parsed?.canView, true);
  assert.equal(parsed?.isTeacher, false);
  assert.equal(parsed?.isEnrolled, true);
  assert.deepEqual(parsed?.classIds, ["cccccccc-cccc-cccc-cccc-cccccccccccc"]);
});

test("access 超时或 5xx 时写操作 fail-closed 为 503，不当成未选课放行", async () => {
  mockCourse(async () => new Promise(() => undefined));
  const access = await resolveCourseAccess(userId, courseId);
  assert.equal(access.accessStatus, "UNAVAILABLE");
  assert.equal(access.canView, false);
  assert.equal(access.isTeacher, false);
  assert.equal(teacherAccessDenial(access)?.status, 503);
  assert.equal(viewAccessDenial(access)?.status, 503);
});

test("access 返回 401/503 时同样 fail-closed", async () => {
  mockCourse(() => ({ status: 503, body: { code: "COURSE_UNAVAILABLE" } }));
  const access = await resolveCourseAccess(userId, courseId);
  assert.equal(access.accessStatus, "UNAVAILABLE");
  assert.equal(teacherAccessDenial(access)?.status, 503);
});

test("课程不存在是 404，不是服务不可用", async () => {
  mockCourse(() => ({ status: 404, body: { code: "COURSE_NOT_FOUND" } }));
  const access = await resolveCourseAccess(userId, courseId);
  assert.equal(access.accessStatus, "OK");
  assert.equal(access.course, null);
  assert.equal(teacherAccessDenial(access)?.status, 404);
  assert.equal(viewAccessDenial(access)?.status, 404);
});

test("教师权限以 A 的 isTeacher 为准，并只打内部接口", async () => {
  const calls = mockCourse((url) => {
    if (url.includes(`/internal/courses/${courseId}/access/${teacherId}`)) {
      return { status: 200, body: { access: { userId: teacherId, courseId, canView: true, isTeacher: true, isEnrolled: false, classIds: [] } } };
    }
    if (url.includes(`/internal/courses/${courseId}/enrollments`)) {
      return { status: 200, body: { items: [{ id: userId, email: "s@x", name: "学生", role: "STUDENT" }] } };
    }
    if (url.includes(`/internal/courses/${courseId}`)) {
      return { status: 200, body: { course: { id: courseId, title: "离散", teacherId, published: true } } };
    }
    return { status: 500, body: { error: "unexpected" } };
  });
  const access = await resolveCourseAccess(teacherId, courseId);
  assert.equal(access.accessStatus, "OK");
  assert.equal(access.isTeacher, true);
  assert.equal(access.canView, true);
  assert.equal(access.course?.title, "离散");
  assert.equal(access.rosterStatus, "OK");
  assert.equal(access.students[0]?.id, userId);
  assert.equal(teacherAccessDenial(access), null);
  assert.ok(calls.every((call) => call.url.includes("/internal/")));
  assert.equal(calls.some((call) => call.url.includes("/enrollment/catalog")), false);
  assert.ok(calls.every((call) => call.headers["x-internal-service-token"]));
  assert.ok(calls.every((call) => !("x-user-role" in call.headers)));
});

test("学生未选课 canView=false，写/读都拒绝且不是 503", async () => {
  mockCourse((url) => {
    if (url.includes("/access/")) {
      return { status: 200, body: { access: { userId, courseId, canView: false, isTeacher: false, isEnrolled: false, classIds: [] } } };
    }
    if (url.includes(`/internal/courses/${courseId}`)) {
      return { status: 200, body: { course: { id: courseId, title: "离散", teacherId, published: true } } };
    }
    return { status: 500, body: {} };
  });
  const access = await resolveCourseAccess(userId, courseId);
  assert.equal(access.accessStatus, "OK");
  assert.equal(viewAccessDenial(access, "无权提交")?.status, 403);
  assert.equal(teacherAccessDenial(access)?.status, 403);
});
