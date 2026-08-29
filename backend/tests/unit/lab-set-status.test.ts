import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canBrowseAt,
  canSubmitAt,
  computeLabSetAccess,
  countAcceptedLabsInSet,
  countAttemptedLabsInSet,
  getStudentStatus,
  getTeacherStatus,
  isLabSetCompleted,
} from "../../src/lib/lab-set-status.js";

const base = {
  startAt: new Date("2026-05-01T08:00:00Z"),
  dueAt: new Date("2026-05-10T08:00:00Z"),
  allowMakeup: true,
  makeupDueAt: new Date("2026-05-12T08:00:00Z"),
  outsideAccessMode: "BLOCK",
  createdAt: new Date("2026-04-01T00:00:00Z"),
};

describe("UC-06 实验集时间窗与完成状态", () => {
  it("UNIT-06-01：教师状态覆盖未开始、进行中、补交和关闭", () => {
    assert.equal(getTeacherStatus(Date.parse("2026-04-30T08:00:00Z"), base), "NOT_STARTED");
    assert.equal(getTeacherStatus(Date.parse("2026-05-05T08:00:00Z"), base), "IN_PROGRESS");
    assert.equal(getTeacherStatus(Date.parse("2026-05-11T08:00:00Z"), base), "MAKEUP");
    assert.equal(getTeacherStatus(Date.parse("2026-05-13T08:00:00Z"), base), "CLOSED");
  });

  it("UNIT-06-02：主截止时刻仍可提交，补交截止后不可提交", () => {
    assert.equal(canSubmitAt(base.dueAt.getTime(), base, false), true);
    assert.equal(canSubmitAt(base.makeupDueAt.getTime(), base, false), true);
    assert.equal(canSubmitAt(base.makeupDueAt.getTime() + 1, base, false), false);
  });

  it("UNIT-06-03：补交期中未完成学生需要补交，已完成学生关闭", () => {
    const duringMakeup = Date.parse("2026-05-11T08:00:00Z");

    assert.equal(getStudentStatus(duringMakeup, base, false), "NEEDS_MAKEUP");
    assert.equal(getStudentStatus(duringMakeup, base, true), "CLOSED");
    assert.equal(computeLabSetAccess({ row: base, isTeacher: false, nowMs: duringMakeup }).statusLabel, "要补交");
  });

  it("UNIT-06-04：VIEW_ONLY 允许截止后浏览但不允许提交", () => {
    const afterClose = Date.parse("2026-05-13T08:00:00Z");
    const viewOnly = { ...base, outsideAccessMode: "VIEW_ONLY" };

    assert.equal(canBrowseAt(afterClose, viewOnly, false), true);
    assert.equal(canSubmitAt(afterClose, viewOnly, false), false);
    assert.equal(canBrowseAt(afterClose, base, false), false);
  });

  it("UNIT-06-05：教师不受学生提交和浏览时间窗限制", () => {
    const beforeStart = Date.parse("2026-04-01T08:00:00Z");

    assert.equal(canSubmitAt(beforeStart, base, true), true);
    assert.equal(canBrowseAt(beforeStart, base, true), true);
  });

  it("UNIT-06-06：完成度统计按学生去重并忽略其他学生提交", () => {
    const submissions = [
      { labId: "lab-1", userId: "student-a", status: "ACCEPTED" },
      { labId: "lab-1", userId: "student-a", status: "ACCEPTED" },
      { labId: "lab-2", userId: "student-a", status: "WRONG_ANSWER" },
      { labId: "lab-2", userId: "student-b", status: "ACCEPTED" },
    ];

    assert.equal(countAcceptedLabsInSet(["lab-1", "lab-2"], submissions, "student-a"), 1);
    assert.equal(countAttemptedLabsInSet(["lab-1", "lab-2"], submissions, "student-a"), 2);
    assert.equal(isLabSetCompleted(["lab-1", "lab-2"], submissions, "student-a"), false);
  });
});
