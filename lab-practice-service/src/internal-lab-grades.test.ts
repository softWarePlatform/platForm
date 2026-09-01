import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { LabGradeReport } from "../../backend/src/lib/lab-grade-report.js";
import internalLabGradesRoutes from "./internal-lab-grades.js";

const courseId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const secondUserId = "00000000-0000-4000-8000-000000000003";

async function makeApp() {
  const app = Fastify();
  await app.register(internalLabGradesRoutes, {
    token: "test-internal-token",
    loadReports: async (_courseId, userIds): Promise<LabGradeReport[]> =>
      userIds.map((id) => ({ userId: id, labAverage: 88, labSets: [] })),
  });
  return app;
}

test("B-02 internal grade endpoint rejects requests without service token", async (t) => {
  const app = await makeApp();
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: `/internal/courses/${courseId}/lab-grades/${userId}`,
  });

  assert.equal(response.statusCode, 401);
});

test("B-02 returns one student's lab grade", async (t) => {
  const app = await makeApp();
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: `/internal/courses/${courseId}/lab-grades/${userId}`,
    headers: { "x-internal-token": "test-internal-token" },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().grade.userId, userId);
  assert.equal(response.json().grade.labAverage, 88);
});

test("B-02 returns grades for a batch of students", async (t) => {
  const app = await makeApp();
  t.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: `/internal/courses/${courseId}/lab-grades/batch`,
    headers: { "x-internal-token": "test-internal-token" },
    payload: { userIds: [userId, secondUserId] },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(
    response.json().grades.map((grade: { userId: string }) => grade.userId),
    [userId, secondUserId],
  );
});
