import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import http from "node:http";
import test, { afterEach, mock } from "node:test";
import {
  deleteWrongBookEntries,
  fetchLabGradebook,
  labIdempotencyKey,
  parseLabGradebook,
  putWrongBookEntry,
} from "../src/lib/lab-client.js";

const courseId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const userId = "11111111-1111-1111-1111-111111111111";
const homeworkId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

afterEach(() => {
  mock.restoreAll();
});

function mockLab(handler: (req: { method: string; url: string; headers: Record<string, string>; body: string }) => { status: number; body: unknown }) {
  const calls: Array<{ method: string; url: string; headers: Record<string, string>; body: string }> = [];
  mock.method(http, "request", (options: http.RequestOptions, callback?: (res: EventEmitter) => void) => {
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(options.headers ?? {})) {
      headers[String(key).toLowerCase()] = String(value);
    }
    const req = new EventEmitter() as EventEmitter & { write: (chunk: string) => boolean; end: () => void; destroy: () => void };
    let body = "";
    req.write = (chunk: string) => {
      body += chunk;
      return true;
    };
    req.destroy = () => undefined;
    req.end = () => {
      const call = {
        method: String(options.method ?? "GET"),
        url: `http://${options.hostname}:${options.port}${options.path ?? "/"}`,
        headers,
        body,
      };
      calls.push(call);
      const result = handler(call);
      const res = new EventEmitter() as EventEmitter & { statusCode: number };
      res.statusCode = result.status;
      callback?.(res);
      queueMicrotask(() => {
        res.emit("data", Buffer.from(JSON.stringify(result.body)));
        res.emit("end");
      });
    };
    return req as unknown as http.ClientRequest;
  });
  return calls;
}

test("解析 B 冻结的 lab-gradebook：无分是 null，不是 0", () => {
  const parsed = parseLabGradebook(200, {
    courseId,
    labStatus: "OK",
    labAverage: null,
    students: [{ userId, labAverage: null }],
  });
  assert.equal(parsed.labStatus, "OK");
  assert.equal(parsed.labAverage, null);
  assert.equal(parsed.students[0]?.labAverage, null);
});

test("Lab 返回 UNAVAILABLE 时 C 标记不可用", () => {
  const parsed = parseLabGradebook(200, { labStatus: "UNAVAILABLE", labAverage: 0, students: [] });
  assert.equal(parsed.labStatus, "UNAVAILABLE");
  assert.equal(parsed.labAverage, null);
});

test("GET lab-gradebook 200 时用真实验分", async () => {
  mockLab(() => ({
    status: 200,
    body: { courseId, labStatus: "OK", labAverage: 70, students: [{ userId, labAverage: 70 }] },
  }));
  const lab = await fetchLabGradebook(courseId, [userId]);
  assert.equal(lab.labStatus, "OK");
  assert.equal(lab.labAverage, 70);
  assert.equal(lab.students[0]?.labAverage, 70);
});

test("GET lab-gradebook 404 时回退 POST lab-grades:batch，最多 500 人", async () => {
  const many = Array.from({ length: 501 }, (_, index) => `${index}`.padStart(8, "0"));
  const calls = mockLab((req) => {
    if (req.url.includes("/lab-gradebook")) return { status: 404, body: { code: "NOT_FOUND" } };
    return { status: 200, body: { labStatus: "OK", labAverage: 66, items: [{ userId, labAverage: 66 }] } };
  });
  const lab = await fetchLabGradebook(courseId, many);
  assert.equal(lab.labStatus, "OK");
  assert.equal(lab.labAverage, 66);
  assert.equal(calls[1]?.method, "POST");
  assert.ok(calls[1]?.url.includes("/lab-grades:batch"));
  assert.equal(JSON.parse(calls[1]?.body ?? "{}").userIds.length, 500);
});

test("PUT 错题带 Idempotency-Key，重复键只更新", async () => {
  const calls = mockLab(() => ({ status: 200, body: { ok: true } }));
  const result = await putWrongBookEntry(
    {
      userId,
      courseId,
      sourceType: "HOMEWORK",
      sourceId: homeworkId,
      title: "作业 · 算法",
      content: "证据",
    },
    `homework:${homeworkId}:${userId}:算法`,
  );
  assert.equal(result.ok, true);
  assert.equal(calls[0]?.method, "PUT");
  assert.ok(calls[0]?.url.endsWith("/internal/wrong-book/entries"));
  assert.equal(calls[0]?.headers["idempotency-key"], labIdempotencyKey(`homework:${homeworkId}:${userId}:算法`));
  assert.equal(JSON.parse(calls[0]?.body ?? "{}").sourceType, "HOMEWORK");
});

test("DELETE 错题走 HOMEWORK/:homeworkId", async () => {
  const calls = mockLab(() => ({ status: 200, body: { ok: true } }));
  const result = await deleteWrongBookEntries("HOMEWORK", homeworkId);
  assert.equal(result.ok, true);
  assert.equal(calls[0]?.method, "DELETE");
  assert.ok(calls[0]?.url.endsWith(`/internal/wrong-book/entries/HOMEWORK/${homeworkId}`));
  assert.ok(calls[0]?.headers["idempotency-key"]);
});

test("Lab 写接口失败时返回不可用，不抛错", async () => {
  mockLab(() => ({ status: 503, body: { code: "LAB_UNAVAILABLE", message: "down", requestId: "r1" } }));
  const put = await putWrongBookEntry(
    { userId, courseId, sourceType: "HOMEWORK", sourceId: homeworkId, title: "t", content: "c" },
    "homework-key-1",
  );
  assert.equal(put.ok, false);
  assert.equal(put.status, 503);
});
