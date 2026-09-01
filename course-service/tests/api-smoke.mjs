import assert from "node:assert/strict";

const base = (process.env.API_BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");

async function call(path, options = {}) {
  const response = await fetch(`${base}${path}`, options);
  const type = response.headers.get("content-type") ?? "";
  const body = type.includes("application/json") ? await response.json() : await response.arrayBuffer();
  return { status: response.status, body };
}

async function login(email) {
  const result = await call("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "Course123456" }),
  });
  assert.equal(result.status, 200, `${email} should log in`);
  return result.body.token;
}

const bearer = (token) => ({ authorization: `Bearer ${token}` });
const json = (token, body) => ({ ...bearer(token), "content-type": "application/json", ...body });

const live = await call("/health/live");
const ready = await call("/health/ready");
assert.equal(live.status, 200);
assert.equal(ready.status, 200);

const teacher = await login("teacher@course.local");
const student = await login("student@course.local");
const admin = await login("admin@course.local");

const forbiddenCreate = await call("/courses", {
  method: "POST",
  headers: json(student),
  body: JSON.stringify({ title: "越权课程" }),
});
assert.equal(forbiddenCreate.status, 403);

const created = await call("/courses", {
  method: "POST",
  headers: json(teacher),
  body: JSON.stringify({
    title: "API 冒烟课程",
    courseCode: `CS-SMOKE-${Date.now()}`,
    capacity: 5,
    scheduleSlots: [{ dayOfWeek: 3, periodStart: 1, periodEnd: 2, room: "B201" }],
  }),
});
assert.equal(created.status, 201);
const published = await call(`/courses/${created.body.course.id}/publish`, { method: "POST", headers: bearer(teacher) });
assert.equal(published.status, 200);
assert.equal(published.body.course.published, true);

const catalog = await call("/enrollment/catalog", { headers: bearer(student) });
assert.equal(catalog.status, 200);
const primary = catalog.body.courses.find((course) => course.courseCode === "CS-SVC-101");
const conflicting = catalog.body.courses.find((course) => course.courseCode === "CS-SVC-102");
assert.ok(primary && conflicting, "seed courses must exist");
const enrolled = await call(`/enrollment/courses/${primary.id}/enroll`, { method: "POST", headers: json(student), body: "{}" });
assert.equal(enrolled.status, 201);
const conflict = await call(`/enrollment/courses/${conflicting.id}/enroll`, { method: "POST", headers: json(student), body: "{}" });
assert.equal(conflict.status, 409);

const announcement = await call(`/courses/${primary.id}/announcements`, {
  method: "POST",
  headers: json(teacher),
  body: JSON.stringify({ title: "API 冒烟公告", content: "用于验证通知与已读" }),
});
assert.equal(announcement.status, 201);
const studentAnnouncements = await call(`/courses/${primary.id}/announcements`, { headers: bearer(student) });
assert.equal(studentAnnouncements.status, 200);
assert.ok(studentAnnouncements.body.announcements.some((item) => item.id === announcement.body.announcement.id));
const markRead = await call(`/announcements/${announcement.body.announcement.id}/read`, { method: "POST", headers: bearer(student) });
assert.equal(markRead.status, 200);

const form = new FormData();
form.append("title", "API 冒烟资料");
form.append("visibility", "ALL");
form.append("file", new Blob(["course-service smoke material"], { type: "text/plain" }), "smoke.txt");
const material = await call(`/courses/${primary.id}/materials`, { method: "POST", headers: bearer(teacher), body: form });
assert.equal(material.status, 201);
const favorite = await call(`/materials/${material.body.material.id}/favorite`, { method: "POST", headers: bearer(student) });
assert.equal(favorite.status, 200);
const download = await call(`/materials/${material.body.material.id}/download`, { headers: bearer(student) });
assert.equal(download.status, 200);
assert.ok(download.body.byteLength > 0);

const period = await call("/admin/enrollment-period", {
  method: "PUT",
  headers: json(admin),
  body: JSON.stringify({ phase: "FORMAL", openAt: "2026-01-01T00:00:00.000Z", closeAt: "2026-12-31T23:59:59.000Z" }),
});
assert.equal(period.status, 200);
const logs = await call("/admin/enrollment-logs", { headers: bearer(admin) });
assert.equal(logs.status, 200);
assert.ok(logs.body.logs.some((log) => log.action === "ENROLL"));

console.log(JSON.stringify({ status: "passed", createdCourseId: created.body.course.id, enrolledCourseId: primary.id, auditLogCount: logs.body.logs.length }));
