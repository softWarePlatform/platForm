import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type {
  SaveHomeworkWrongBookInput,
  SavedWrongBookEntry,
} from "./wrong-book-write.js";
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
    deleteEntries: async () => 2,
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
    headers: { "x-internal-service-token": "test-internal-token" },
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
    headers: { "x-internal-service-token": "test-internal-token" },
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

test("B-03 frozen PUT contract requires idempotency and writes one entry", async (t) => {
  const app = await makeApp(async (input) => [
    { id: "entry-1", title: input.entries[0]!.title, content: input.entries[0]!.content, created: true },
  ]);
  t.after(() => app.close());
  const payload = { userId, courseId, sourceType: "HOMEWORK", sourceId: homeworkId, title: "数组", content: "边界" };
  const missingKey = await app.inject({
    method: "PUT",
    url: "/internal/wrong-book/entries",
    headers: { "x-internal-service-token": "test-internal-token" },
    payload,
  });
  assert.equal(missingKey.statusCode, 400);

  const response = await app.inject({
    method: "PUT",
    url: "/internal/wrong-book/entries",
    headers: { "x-internal-service-token": "test-internal-token", "idempotency-key": `homework:${homeworkId}:${userId}:数组` },
    payload,
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().entry.title, "数组");
});

test("B-03 frozen DELETE contract removes homework entries", async (t) => {
  const app = await makeApp(async () => []);
  t.after(() => app.close());
  const response = await app.inject({
    method: "DELETE",
    url: `/internal/wrong-book/entries/HOMEWORK/${homeworkId}`,
    headers: { "x-internal-service-token": "test-internal-token" },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().deleted, 2);
});
