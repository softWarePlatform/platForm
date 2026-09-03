import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { currentSemester } from "../../src/lib/semester.js";

describe("学期与课表口径", () => {
  it("UNIT-11-01：学期 key 为 4 位年份加 spring/fall", () => {
    const s = currentSemester();
    assert.match(s.key, /^\d{4}-(spring|fall)$/);
  });

  it("UNIT-11-02：展示标签为「yyyy-yyyy+1 春季/秋季学期」", () => {
    const s = currentSemester();
    assert.match(s.label, /^\d{4}-\d{4} (春季|秋季)学期$/);
  });

  it("UNIT-11-03：key 与 label 的学期季节保持一致", () => {
    const s = currentSemester();
    const season = s.key.split("-")[1] === "spring" ? "春季" : "秋季";
    assert.ok(s.label.includes(season));
  });

  it("UNIT-11-04：key 中年份与 label 起始年份一致", () => {
    const s = currentSemester();
    assert.ok(s.label.startsWith(s.key.split("-")[0]));
  });
});
