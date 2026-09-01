import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildLabGradeReports } from "../../src/lib/lab-grade-report.js";

const plan = [
  {
    id: "set-1",
    title: "基础实验",
    labs: [
      { id: "lab-1", title: "实验一" },
      { id: "lab-2", title: "实验二" },
    ],
  },
  {
    id: "set-2",
    title: "综合实验",
    labs: [{ id: "lab-3", title: "实验三" }],
  },
];

describe("B-02 实验成绩内部查询", () => {
  it("每个实验取最高分，再按实验集计算总均分", () => {
    const [report] = buildLabGradeReports(["student-a"], plan, [
      { userId: "student-a", labId: "lab-1", score: 60 },
      { userId: "student-a", labId: "lab-1", score: 100 },
      { userId: "student-a", labId: "lab-2", score: 0 },
      { userId: "student-a", labId: "lab-3", score: 80 },
    ]);

    assert.equal(report.labSets[0].average, 50);
    assert.equal(report.labSets[0].labs[0].bestScore, 100);
    assert.equal(report.labSets[0].labs[1].bestScore, 0);
    assert.equal(report.labAverage, 65);
  });

  it("批量查询保留没有提交的学生，并返回 null 成绩", () => {
    const reports = buildLabGradeReports(["student-a", "student-b"], plan, [
      { userId: "student-a", labId: "lab-1", score: 90 },
    ]);

    assert.equal(reports.length, 2);
    assert.equal(reports[1].userId, "student-b");
    assert.equal(reports[1].labAverage, null);
    assert.ok(reports[1].labSets.every((labSet) => labSet.average === null));
  });
});
