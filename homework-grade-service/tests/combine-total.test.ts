import assert from "node:assert/strict";
import test from "node:test";
import { combineTotal } from "../src/lib/lab-client.js";

test("Lab 可用时按权重合成总分，不当成 0 的缺省", () => {
  const total = combineTotal(80, 60, 0.6, 0.4, "OK");
  assert.equal(total.totalScore, 80 * 0.6 + 60 * 0.4);
  assert.equal(total.labAverage, 60);
  assert.equal(total.provisionalTotal, null);
});

test("Lab 不可用时总分为空，只给作业部分的临时分，实验不当 0", () => {
  const total = combineTotal(80, 0, 0.6, 0.4, "UNAVAILABLE");
  assert.equal(total.totalScore, null);
  assert.equal(total.labAverage, null);
  assert.equal(total.provisionalTotal, 80 * 0.6);
});

test("两边都没有分数时不合成 0 分", () => {
  const unavailable = combineTotal(null, null, 0.5, 0.5, "UNAVAILABLE");
  assert.equal(unavailable.totalScore, null);
  assert.equal(unavailable.provisionalTotal, null);
  const okEmpty = combineTotal(null, null, 0.5, 0.5, "OK");
  assert.equal(okEmpty.totalScore, null);
  assert.equal(okEmpty.provisionalTotal, null);
});
