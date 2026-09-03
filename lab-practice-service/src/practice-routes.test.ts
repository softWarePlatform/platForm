import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import practiceRoutes from "./routes/practice.js";
import { signToken } from "./lib/jwt.js";
import { CourseClientError } from "./course-client.js";

const courseId = "00000000-0000-4000-8000-000000000002";
const userId = "00000000-0000-4000-8000-000000000001";

async function buildPracticeApp() {
  const app = Fastify();
  await app.register(multipart);
  await app.register(rateLimit, { global: false });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof CourseClientError) {
      return reply.code(503).send({ code: "COURSE_UNAVAILABLE", requestId: request.id });
    }
    return reply.send(error);
  });
  await app.register(practiceRoutes);
  return app;
}

test("UC07 未登录访问练习接口返回 401", async (t) => {
  const app = await buildPracticeApp();
  t.after(() => app.close());
  const response = await app.inject({ method: "GET", url: `/courses/${courseId}/practice/tags` });
  assert.equal(response.statusCode, 401);
});

test("UC07 Course 服务不可用时返回稳定 503", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => Response.json({}, { status: 503 })) as typeof fetch;
  const app = await buildPracticeApp();
  t.after(async () => { globalThis.fetch = originalFetch; await app.close(); });
  const token = signToken({ sub: userId, email: "student@example.com", role: "STUDENT" });
  const response = await app.inject({
    method: "GET", url: `/courses/${courseId}/practice/tags`,
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(response.statusCode, 503);
  assert.equal(response.json().code, "COURSE_UNAVAILABLE");
});

test("UC07 创建练习时拒绝错误请求格式", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input) => {
    const url = String(input);
    if (url.includes("/access/")) {
      return Response.json({ access: { canView: true, isEnrolled: true } });
    }
    return Response.json({ course: { id: courseId, title: "课程", teacherId: "teacher", published: true } });
  }) as typeof fetch;
  const app = await buildPracticeApp();
  t.after(async () => { globalThis.fetch = originalFetch; await app.close(); });
  const token = signToken({ sub: userId, email: "student@example.com", role: "STUDENT" });
  const response = await app.inject({
    method: "POST", url: `/courses/${courseId}/practice/sessions`, payload: {},
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, "参数无效");
});
