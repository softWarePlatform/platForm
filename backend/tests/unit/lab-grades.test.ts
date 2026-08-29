import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { bestScoreForLab, computeLabSetSetAverage } from "../../src/lib/lab-grades.js";

const submissions = [
  { labId: "lab-1", userId: "student-a", score: 60 },
  { labId: "lab-1", userId: "student-a", score: 95 },
  { labId: "lab-2", userId: "student-a", score: 0 },
  { labId: "lab-2", userId: "student-b", score: 100 },
  { labId: "lab-3", userId: "student-a", score: null },
];

describe("UC-09 成绩汇总规则", () => {
  it("UNIT-09-01：同一实验多次提交取最高分", () => {
    assert.equal(bestScoreForLab(submissions, "student-a", "lab-1"), 95);
  });

  it("UNIT-09-02：零分是有效成绩而不是缺失值", () => {
    assert.equal(bestScoreForLab(submissions, "student-a", "lab-2"), 0);
  });

  it("UNIT-09-03：实验集均分只统计已有成绩的题目", () => {
    assert.equal(computeLabSetSetAverage(["lab-1", "lab-2", "lab-3"], submissions, "student-a"), 47.5);
  });

  it("UNIT-09-04：空实验集或全部未评分时返回 null", () => {
    assert.equal(computeLabSetSetAverage([], submissions, "student-a"), null);
    assert.equal(computeLabSetSetAverage(["lab-3"], submissions, "student-a"), null);
  });
});
