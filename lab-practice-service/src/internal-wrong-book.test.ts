import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type {
  SaveHomeworkWrongBookInput,
  SavedWrongBookEntry,
} from "../../backend/src/lib/wrong-book-write.js";
import internalWrongBookRoutes from "./internal-wrong-book.js";

const userId = "00000000-0000-4000-8000-000000000001";
const courseId = "00000000-0000-4000-8000-000000000002";
const homeworkId = "00000000-0000-4000-8000-000000000003";

async function makeApp(
  saveEntries: (input: SaveHomeworkWrongBookInput) => Promise<SavedWrongBookEntry[]>,
) {
  const app = Fastify();
  await app.register(internalWrongBookRoutes, {
    token: "test-internal-token",
    saveEntries,
  });
  return app;
}

test("B-03 rejects wrong-book writes without a service token", async (t) => {
  const app = await makeApp(async () => []);
  t.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/internal/wrong-book/homework",
    payload: { userId, courseId, homeworkId, entries: [{ title: "错题", content: "原因" }] },
  });

  assert.equal(response.statusCode, 401);
});

test("B-03 validates input before writing", async (t) => {
  let called = false;
  const app = await makeApp(async () => {
    called = true;
    return [];
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/internal/wrong-book/homework",
    headers: { "x-internal-token": "test-internal-token" },
    payload: { userId: "invalid", courseId, homeworkId, entries: [] },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(called, false);
});

test("B-03 reports created and updated idempotent entries", async (t) => {
  let received: SaveHomeworkWrongBookInput | undefined;
  const app = await makeApp(async (input) => {
    received = input;
    return [
      { id: "entry-1", title: "数组边界", content: "越界", created: true },
      { id: "entry-2", title: "递归终止", content: "缺少终止条件", created: false },
    ];
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/internal/wrong-book/homework",
    headers: { "x-internal-token": "test-internal-token" },
    payload: {
      userId,
      courseId,
      homeworkId,
      entries: [
        { title: "数组边界", content: "越界" },
        { title: "递归终止", content: "缺少终止条件" },
      ],
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().count, 2);
  assert.equal(response.json().createdCount, 1);
  assert.equal(response.json().updatedCount, 1);
  assert.equal(received?.homeworkId, homeworkId);
});
