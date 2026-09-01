import assert from "node:assert/strict";
import test from "node:test";
import {
  dispatchPendingJudgeSubmissions,
  tryEnqueueJudgeSubmission,
  type JudgeDispatcherDependencies,
} from "../../src/lib/judge-dispatcher.js";

test("uses submission id as the idempotent queue job id", async () => {
  const added: string[] = [];
  const dependencies: JudgeDispatcherDependencies = {
    listPending: async () => [],
    addJob: async (submissionId) => added.push(submissionId),
  };

  assert.equal(await tryEnqueueJudgeSubmission("submission-1", dependencies), true);
  assert.deepEqual(added, ["submission-1"]);
});

test("keeps enqueue failures recoverable instead of throwing", async () => {
  const dependencies: JudgeDispatcherDependencies = {
    listPending: async () => [],
    addJob: async () => {
      throw new Error("redis unavailable");
    },
  };

  assert.equal(await tryEnqueueJudgeSubmission("submission-2", dependencies), false);
});

test("returns after a bounded wait when Redis never responds", async () => {
  const dependencies: JudgeDispatcherDependencies = {
    listPending: async () => [],
    addJob: async () => new Promise(() => undefined),
  };

  const startedAt = Date.now();
  assert.equal(await tryEnqueueJudgeSubmission("submission-timeout", dependencies, 10), false);
  assert.ok(Date.now() - startedAt < 500, "enqueue timeout should not leave the API hanging");
});

test("dispatches pending submissions and reports partial failures", async () => {
  const added: string[] = [];
  let observedCutoff: Date | undefined;
  const dependencies: JudgeDispatcherDependencies = {
    listPending: async (_limit, createdBefore) => {
      observedCutoff = createdBefore;
      return [{ id: "submission-ok" }, { id: "submission-failed" }];
    },
    addJob: async (submissionId) => {
      if (submissionId === "submission-failed") throw new Error("redis unavailable");
      added.push(submissionId);
    },
  };

  const now = new Date("2026-09-01T08:00:00.000Z");
  const result = await dispatchPendingJudgeSubmissions(dependencies, {
    now,
    minAgeMs: 10_000,
  });

  assert.equal(observedCutoff?.toISOString(), "2026-09-01T07:59:50.000Z");
  assert.deepEqual(added, ["submission-ok"]);
  assert.deepEqual(result, { examined: 2, queued: 1, failed: 1 });
});
