import assert from "node:assert/strict";
import test from "node:test";
import { parseEnrollmentRoster } from "../src/lib/course-client.js";
import { buildGradebookStudents, releasedHomeworkGrade } from "../src/lib/gradebook.js";

test("名单同时接受 students 与冻结后的 items，并用 userId 兜底", () => {
  const fromStudents = parseEnrollmentRoster({
    students: [{ id: "11111111-1111-1111-1111-111111111111", email: "a@x", name: "甲", role: "STUDENT" }],
  });
  const fromItems = parseEnrollmentRoster({
    items: [{ userId: "11111111-1111-1111-1111-111111111111", email: "a@x", name: "甲", role: "STUDENT" }],
  });
  assert.equal(fromStudents[0]?.id, "11111111-1111-1111-1111-111111111111");
  assert.equal(fromItems[0]?.id, fromStudents[0]?.id);
  assert.deepEqual(parseEnrollmentRoster({}), []);
});

test("单人作业成绩只统计已发布，未发布不进入均分", () => {
  const homeworks = [
    { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", title: "已发布" },
    { id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", title: "未发布" },
  ];
  const userId = "11111111-1111-1111-1111-111111111111";
  const grade = releasedHomeworkGrade(
    homeworks,
    [
      { homeworkId: homeworks[0].id, userId, score: 90, graded: true, released: true },
      { homeworkId: homeworks[1].id, userId, score: 10, graded: true, released: false },
    ],
    userId,
  );
  assert.equal(grade.homeworks.length, 1);
  assert.equal(grade.homeworkAverage, 90);
});

test("final-gradebook 在 Lab UNAVAILABLE 时总分为空且不是 0", () => {
  const userId = "11111111-1111-1111-1111-111111111111";
  const hwId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const rows = buildGradebookStudents({
    homeworks: [{ id: hwId, title: "作业" }],
    submissions: [{ homeworkId: hwId, userId, score: 80, graded: true, released: true }],
    students: [{ id: userId, email: "s@x", name: "学生", role: "STUDENT" }],
    lab: { labStatus: "UNAVAILABLE", labAverage: 0, students: [{ userId, labAverage: 0 }] },
    homeworkWeight: 0.6,
    labWeight: 0.4,
  });
  assert.equal(rows[0]?.summary.labStatus, "UNAVAILABLE");
  assert.equal(rows[0]?.summary.totalScore, null);
  assert.equal(rows[0]?.summary.labAverage, null);
  assert.equal(rows[0]?.summary.provisionalTotal, 80 * 0.6);
  assert.notEqual(rows[0]?.summary.totalScore, 0);
});
