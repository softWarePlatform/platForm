import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildLabReminderCopy,
  collectActiveRemindersForLabSets,
  isInLabReminderWindow,
} from "../../src/lib/lab-reminders.js";

const HOUR = 60 * 60 * 1000;

describe("UC-06 实验提醒规则", () => {
  it("UNIT-22-01：事件前 lead 毫秒内处于提醒窗口", () => {
    const eventAt = new Date("2026-05-11T10:00:00Z");
    assert.equal(isInLabReminderWindow(eventAt, new Date("2026-05-11T09:00:00Z"), 1 * HOUR), true);
  });

  it("UNIT-22-02：窗口起点边界包含，事件时刻本身不包含", () => {
    const eventAt = new Date("2026-05-11T10:00:00Z");
    assert.equal(isInLabReminderWindow(eventAt, new Date("2026-05-11T09:00:00Z"), 1 * HOUR), true);
    assert.equal(isInLabReminderWindow(eventAt, new Date("2026-05-11T10:00:00Z"), 1 * HOUR), false);
  });

  it("UNIT-22-03：超出窗口或早于窗口不触发", () => {
    const eventAt = new Date("2026-05-11T10:00:00Z");
    assert.equal(isInLabReminderWindow(eventAt, new Date("2026-05-11T08:59:59Z"), 1 * HOUR), false);
    assert.equal(isInLabReminderWindow(eventAt, new Date("2026-05-11T10:00:01Z"), 1 * HOUR), false);
  });

  it("UNIT-22-04：开始提醒文案包含课程与实验标题", () => {
    const copy = buildLabReminderCopy(
      { title: "实验三", course: { title: "数据结构" } },
      "BEFORE_START",
      new Date("2026-05-11T10:00:00Z"),
    );
    assert.ok(copy.title.includes("实验即将开始"));
    assert.ok(copy.title.includes("实验三"));
    assert.ok(copy.body.includes("数据结构"));
    assert.ok(copy.body.includes("实验三"));
  });

  it("UNIT-22-05：截止 1 小时提醒与 24 小时提醒文案不同", () => {
    const base = { title: "实验一", course: { title: "网络" } };
    const h1 = buildLabReminderCopy(base, "BEFORE_END_1H", new Date("2026-05-11T10:00:00Z"));
    const h24 = buildLabReminderCopy(base, "BEFORE_END_24H", new Date("2026-05-11T10:00:00Z"));
    assert.ok(h1.title.includes("1 小时内"));
    assert.ok(!h24.title.includes("1 小时内"));
    assert.ok(h24.title.includes("即将截止"));
  });

  it("UNIT-22-06：开始前 24 小时窗口内生成 BEFORE_START 提醒", () => {
    const now = new Date("2026-05-10T12:00:00Z");
    const labSets = [
      {
        id: "LS1",
        courseId: "C1",
        title: "实验一",
        startAt: new Date("2026-05-11T10:00:00Z"),
        dueAt: null,
        course: { title: "课程A" },
      },
    ];
    const dto = collectActiveRemindersForLabSets(labSets, now);
    assert.equal(dto.length, 1);
    assert.equal(dto[0]?.kind, "BEFORE_START");
    assert.equal(dto[0]?.labSetId, "LS1");
  });

  it("UNIT-22-07：截止前 24 小时窗口内生成 BEFORE_END_24H 提醒", () => {
    const now = new Date("2026-05-10T12:00:00Z");
    const labSets = [
      {
        id: "LS2",
        courseId: "C1",
        title: "实验二",
        startAt: null,
        dueAt: new Date("2026-05-11T09:00:00Z"),
        course: { title: "课程A" },
      },
    ];
    const dto = collectActiveRemindersForLabSets(labSets, now);
    assert.equal(dto.length, 1);
    assert.equal(dto[0]?.kind, "BEFORE_END_24H");
  });

  it("UNIT-22-08：窗口外的实验集不生成提醒", () => {
    const now = new Date("2026-05-10T12:00:00Z");
    const labSets = [
      {
        id: "LS3",
        courseId: "C1",
        title: "实验三",
        startAt: new Date("2026-05-12T12:00:00Z"),
        dueAt: new Date("2026-05-11T13:00:00Z"),
        course: { title: "课程A" },
      },
    ];
    assert.equal(collectActiveRemindersForLabSets(labSets, now).length, 0);
  });

  it("UNIT-22-09：多个提醒按事件时间升序排列", () => {
    const now = new Date("2026-05-10T12:00:00Z");
    const labSets = [
      {
        id: "A",
        courseId: "C1",
        title: "A",
        startAt: new Date("2026-05-11T10:00:00Z"),
        dueAt: null,
        course: { title: "课程A" },
      },
      {
        id: "B",
        courseId: "C1",
        title: "B",
        startAt: null,
        dueAt: new Date("2026-05-11T08:00:00Z"),
        course: { title: "课程A" },
      },
    ];
    const dto = collectActiveRemindersForLabSets(labSets, now);
    assert.equal(dto.length, 2);
    assert.equal(dto[0]?.labSetId, "B");
    assert.equal(dto[1]?.labSetId, "A");
  });

  it("UNIT-22-10：linkPath 指向课程实验集页面", () => {
    const now = new Date("2026-05-10T12:00:00Z");
    const labSets = [
      {
        id: "LSX",
        courseId: "C9",
        title: "实验",
        startAt: new Date("2026-05-11T10:00:00Z"),
        dueAt: null,
        course: { title: "课程A" },
      },
    ];
    const dto = collectActiveRemindersForLabSets(labSets, now);
    assert.equal(dto[0]?.linkPath, "/courses/C9/labs/sets/LSX");
  });
});
