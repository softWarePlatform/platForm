import assert from "node:assert/strict";
import test from "node:test";
import { fetchCourseUserIds } from "./course-client.js";

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
