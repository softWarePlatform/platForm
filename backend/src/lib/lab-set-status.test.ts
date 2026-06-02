import assert from "node:assert/strict";
import {
  canBrowseAt,
  canSubmitAt,
  computeLabSetAccess,
  getStudentStatus,
  getTeacherStatus,
  isInMakeupPeriod,
} from "./lab-set-status.js";

const base = {
  startAt: new Date("2026-05-01T08:00:00Z"),
  dueAt: new Date("2026-05-10T08:00:00Z"),
  allowMakeup: true,
  makeupDueAt: new Date("2026-05-12T08:00:00Z"),
  outsideAccessMode: "BLOCK",
  createdAt: new Date("2026-04-01T00:00:00Z"),
};

assert.equal(getTeacherStatus(Date.parse("2026-04-15"), base), "NOT_STARTED");
assert.equal(getTeacherStatus(Date.parse("2026-05-05"), base), "IN_PROGRESS");
assert.equal(getTeacherStatus(Date.parse("2026-05-11"), base), "MAKEUP");
assert.equal(getTeacherStatus(Date.parse("2026-05-13"), base), "CLOSED");

assert.equal(getStudentStatus(Date.parse("2026-05-11"), base, false), "NEEDS_MAKEUP");
assert.equal(getStudentStatus(Date.parse("2026-05-11"), base, true), "CLOSED");

assert.equal(canSubmitAt(Date.parse("2026-05-11"), base, false), true);
assert.equal(canSubmitAt(Date.parse("2026-05-13"), base, false), false);

const viewOnly = { ...base, outsideAccessMode: "VIEW_ONLY" };
assert.equal(canBrowseAt(Date.parse("2026-05-13"), viewOnly, false), true);
assert.equal(canSubmitAt(Date.parse("2026-05-13"), viewOnly, false), false);
assert.equal(canBrowseAt(Date.parse("2026-05-13"), base, false), false);

const access = computeLabSetAccess({
  row: base,
  isTeacher: false,
  nowMs: Date.parse("2026-05-11"),
  labSetCompleted: false,
});
assert.equal(access.statusLabel, "要补交");
assert.equal(access.inMakeupPeriod, isInMakeupPeriod(Date.parse("2026-05-11"), base));

console.log("lab-set-status.test.ts: ok");
