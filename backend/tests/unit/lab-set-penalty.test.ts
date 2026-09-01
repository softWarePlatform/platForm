import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analyzeSubmissionsForLabSet } from "../../src/lib/lab-set-penalty.js";

const BASE = Date.parse("2026-05-01T08:00:00Z");
const at = (min: number) => new Date(BASE + min * 60_000);
const sub = (labId: string, status: string, min: number, score: number | null = null, userId = "u1") => ({
  labId,
  userId,
  status,
  score,
  createdAt: at(min),
});

describe("UC-06 实验集罚时规则", () => {
  it("UNIT-15-01：首次 AC 前每次失败计 20 分钟罚时", () => {
    const r = analyzeSubmissionsForLabSet({
      penaltyStartMs: BASE,
      labIds: ["L1"],
      labTitles: new Map([["L1", "题A"]]),
      submissions: [sub("L1", "WRONG_ANSWER", 5), sub("L1", "ERROR", 10), sub("L1", "ACCEPTED", 20)],
      userId: "u1",
    });
    assert.equal(r.labs[0]?.solved, true);
    assert.equal(r.labs[0]?.wrongBeforeFirstAc, 2);
    // acPart=20 分钟 + 2×20 罚时
    assert.equal(r.labs[0]?.problemPenaltyMinutes, 60);
    assert.equal(r.totalPenaltyMinutes, 60);
    assert.equal(r.allSolved, true);
  });

  it("UNIT-15-02：未 AC 的题目不计罚时且不计入 allSolved", () => {
    const r = analyzeSubmissionsForLabSet({
      penaltyStartMs: BASE,
      labIds: ["L1", "L2"],
      labTitles: new Map([["L1", "题A"], ["L2", "题B"]]),
      submissions: [
        sub("L1", "ACCEPTED", 10, 100),
        sub("L2", "WRONG_ANSWER", 15, 0),
      ],
      userId: "u1",
    });
    assert.equal(r.labs[1]?.solved, false);
    assert.equal(r.labs[1]?.problemPenaltyMinutes, 0);
    assert.equal(r.totalPenaltyMinutes, 10);
    assert.equal(r.allSolved, false);
  });

  it("UNIT-15-03：只统计当前用户的提交", () => {
    const r = analyzeSubmissionsForLabSet({
      penaltyStartMs: BASE,
      labIds: ["L1"],
      labTitles: new Map([["L1", "题A"]]),
      submissions: [
        sub("L1", "WRONG_ANSWER", 5, 0, "u2"),
        sub("L1", "WRONG_ANSWER", 5, 0, "u2"),
        sub("L1", "ACCEPTED", 10, 100),
      ],
      userId: "u1",
    });
    assert.equal(r.labs[0]?.wrongBeforeFirstAc, 0);
    assert.equal(r.totalPenaltyMinutes, 10);
  });

  it("UNIT-15-04：无提交时状态为占位符且总罚时为 0", () => {
    const r = analyzeSubmissionsForLabSet({
      penaltyStartMs: BASE,
      labIds: ["L1"],
      labTitles: new Map([["L1", "题A"]]),
      submissions: [],
      userId: "u1",
    });
    assert.equal(r.labs[0]?.lastStatus, "—");
    assert.equal(r.labs[0]?.firstAcAt, null);
    assert.equal(r.totalPenaltyMinutes, 0);
    assert.equal(r.allSolved, false);
  });

  it("UNIT-15-05：lastSubmitAt 取所有提交中的最晚时间", () => {
    const r = analyzeSubmissionsForLabSet({
      penaltyStartMs: BASE,
      labIds: ["L1"],
      labTitles: new Map([["L1", "题A"]]),
      submissions: [sub("L1", "WRONG_ANSWER", 5), sub("L1", "WRONG_ANSWER", 30)],
      userId: "u1",
    });
    assert.equal(r.lastSubmitAt, at(30).toISOString());
  });

  it("UNIT-15-06：空 labIds 时 allSolved 为 false", () => {
    const r = analyzeSubmissionsForLabSet({
      penaltyStartMs: BASE,
      labIds: [],
      labTitles: new Map(),
      submissions: [],
      userId: "u1",
    });
    assert.equal(r.allSolved, false);
  });

  it("UNIT-15-07：PENDING 等非失败状态不增加罚时次数", () => {
    const r = analyzeSubmissionsForLabSet({
      penaltyStartMs: BASE,
      labIds: ["L1"],
      labTitles: new Map([["L1", "题A"]]),
      submissions: [sub("L1", "PENDING", 5), sub("L1", "ACCEPTED", 20)],
      userId: "u1",
    });
    assert.equal(r.labs[0]?.wrongBeforeFirstAc, 0);
    assert.equal(r.labs[0]?.problemPenaltyMinutes, 20);
  });

  it("UNIT-15-08：bestScore 取该题全部提交的最高分", () => {
    const r = analyzeSubmissionsForLabSet({
      penaltyStartMs: BASE,
      labIds: ["L1"],
      labTitles: new Map([["L1", "题A"]]),
      submissions: [sub("L1", "WRONG_ANSWER", 5, 40), sub("L1", "ACCEPTED", 20, 100)],
      userId: "u1",
    });
    assert.equal(r.labs[0]?.bestScore, 100);
  });

  it("UNIT-15-09：无分数提交时 bestScore 为 null", () => {
    const r = analyzeSubmissionsForLabSet({
      penaltyStartMs: BASE,
      labIds: ["L1"],
      labTitles: new Map([["L1", "题A"]]),
      submissions: [sub("L1", "WRONG_ANSWER", 5)],
      userId: "u1",
    });
    assert.equal(r.labs[0]?.bestScore, null);
  });

  it("UNIT-15-10：多题罚时累加为总罚时", () => {
    const r = analyzeSubmissionsForLabSet({
      penaltyStartMs: BASE,
      labIds: ["L1", "L2"],
      labTitles: new Map([["L1", "题A"], ["L2", "题B"]]),
      submissions: [
        sub("L1", "ACCEPTED", 10, 100),
        sub("L2", "WRONG_ANSWER", 5, 0),
        sub("L2", "ACCEPTED", 40, 100),
      ],
      userId: "u1",
    });
    // L1: 10 分钟；L2: acPart 40 + 1×20 = 60
    assert.equal(r.totalPenaltyMinutes, 70);
    assert.equal(r.allSolved, true);
  });
});
