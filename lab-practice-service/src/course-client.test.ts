import assert from "node:assert/strict";
import test from "node:test";
import {
  createCourseNotifications,
  fetchCourseAccess,
  fetchCourseInfo,
  fetchCourseUserIds,
  fetchCourseUsers,
  notificationIdempotencyKey,
} from "./course-client.js";

test("notification idempotency keys are safe ASCII headers", () => {
  assert.equal(notificationIdempotencyKey("lab-set:1"), "lab-set:1");
  const encoded = notificationIdempotencyKey("实验提交：课程一");
  assert.match(encoded, /^sha256:[a-f0-9]{64}$/);
  assert.equal(encoded, notificationIdempotencyKey("实验提交：课程一"));
});

test("Course roster follows the frozen pageSize=200 contract and paginates", async () => {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    urls.push(url);
    const page = new URL(url).searchParams.get("page");
    const items = page === "1"
      ? Array.from({ length: 200 }, (_, index) => ({ id: `student-${index}` }))
      : [{ id: "student-200" }];
    return new Response(JSON.stringify({ items, total: 201 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const userIds = await fetchCourseUserIds("course-1");
    assert.equal(userIds.length, 201);
    assert.match(urls[0]!, /page=1&pageSize=200$/);
    assert.match(urls[1]!, /page=2&pageSize=200$/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Course client covers info, access, batch users and idempotent notifications", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith("/internal/courses/course-1")) {
      return Response.json({ course: { id: "course-1", title: "课程", teacherId: "teacher-1", published: true } });
    }
    if (url.endsWith("/internal/courses/course-1/access/user-1")) {
      return Response.json({ access: { userId: "user-1", courseId: "course-1", role: "STUDENT", canView: true, isTeacher: false, isEnrolled: true, classId: null, classIds: [] } });
    }
    if (url.endsWith("/internal/users:batch")) {
      return Response.json({ users: [{ id: "user-1", email: "u@example.com", name: "U", role: "STUDENT" }], missingUserIds: ["user-2"] });
    }
    if (url.endsWith("/internal/notifications")) {
      return Response.json({ created: 1, deduped: 0, idempotentReplay: false }, { status: 201 });
    }
    return Response.json({}, { status: 404 });
  }) as typeof fetch;

  try {
    assert.equal((await fetchCourseInfo("course-1", "request-1"))?.teacherId, "teacher-1");
    assert.equal((await fetchCourseAccess("course-1", "user-1"))?.canView, true);
    const users = await fetchCourseUsers(["user-1", "user-2", "user-1"]);
    assert.equal(users.users.length, 1);
    assert.deepEqual(users.missingUserIds, ["user-2"]);
    const notification = await createCourseNotifications({
      userIds: ["user-1"],
      title: "新实验",
      idempotencyKey: "lab-set:1",
    });
    assert.equal(notification.created, 1);
    const notifyCall = calls.find((call) => call.url.endsWith("/internal/notifications"));
    assert.equal(new Headers(notifyCall?.init?.headers).get("idempotency-key"), "lab-set:1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
