import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filterByTagRules,
  matchesTagFilter,
  parseTagFilterQuery,
  tagPathRelates,
} from "../../src/lib/practice-tag-filter.js";

describe("UC-07 练习标签筛选", () => {
  it("UNIT-17-01：精确相等判定相关", () => {
    assert.equal(tagPathRelates("数据库", "数据库"), true);
  });

  it("UNIT-17-02：筛选标签为题目路径前缀时相关", () => {
    assert.equal(tagPathRelates("数据库 > ER图", "数据库"), true);
  });

  it("UNIT-17-03：筛选标签为路径中任意单段时相关", () => {
    assert.equal(tagPathRelates("数据库 > ER图", "ER图"), true);
  });

  it("UNIT-17-04：不相关路径与空标签返回 false", () => {
    assert.equal(tagPathRelates("操作系统 > 调度", "数据库"), false);
    assert.equal(tagPathRelates("操作系统", ""), false);
  });

  it("UNIT-17-05：INCLUDE_ALL 要求所有标签相关", () => {
    const q = "数据库 > ER图";
    assert.equal(matchesTagFilter(q, ["数据库", "ER图"], "INCLUDE_ALL"), true);
    assert.equal(matchesTagFilter(q, ["数据库", "网络"], "INCLUDE_ALL"), false);
  });

  it("UNIT-17-06：INCLUDE_ANY 命中任一标签即可", () => {
    assert.equal(matchesTagFilter("数据库", ["数据库", "网络"], "INCLUDE_ANY"), true);
    assert.equal(matchesTagFilter("操作系统", ["数据库", "网络"], "INCLUDE_ANY"), false);
  });

  it("UNIT-17-07：EXCLUDE_ANY 命中任一标签即排除", () => {
    assert.equal(matchesTagFilter("数据库", ["数据库"], "EXCLUDE_ANY"), false);
    assert.equal(matchesTagFilter("操作系统", ["数据库"], "EXCLUDE_ANY"), true);
  });

  it("UNIT-17-08：EXCLUDE_ALL 仅当全部标签命中时排除", () => {
    const q = "数据库 > ER图";
    assert.equal(matchesTagFilter(q, ["数据库", "ER图"], "EXCLUDE_ALL"), false);
    assert.equal(matchesTagFilter(q, ["数据库", "网络"], "EXCLUDE_ALL"), true);
  });

  it("UNIT-17-09：未选择任何标签时全部放行", () => {
    assert.equal(matchesTagFilter("任意", [], "INCLUDE_ALL"), true);
  });

  it("UNIT-17-10：filterByTagRules 按规则过滤题目数组", () => {
    const items = [
      { tagPath: "数据库" },
      { tagPath: "操作系统" },
      { tagPath: "数据库 > 索引" },
    ];
    const filtered = filterByTagRules(items, ["数据库"], "INCLUDE_ANY");
    assert.deepEqual(filtered.map((i) => i.tagPath), ["数据库", "数据库 > 索引"]);
  });

  it("UNIT-17-11：parseTagFilterQuery 支持字符串与数组且裁剪空白", () => {
    assert.deepEqual(parseTagFilterQuery({ tags: " 数据库 " }), {
      mode: "INCLUDE_ANY",
      tags: ["数据库"],
    });
    assert.deepEqual(parseTagFilterQuery({ tags: ["a", " b "] }), {
      mode: "INCLUDE_ANY",
      tags: ["a", "b"],
    });
  });

  it("UNIT-17-12：非法模式回退 INCLUDE_ANY，空标签返回 null", () => {
    assert.deepEqual(parseTagFilterQuery({ tagMode: "BOGUS", tags: "a" }), {
      mode: "INCLUDE_ANY",
      tags: ["a"],
    });
    assert.equal(parseTagFilterQuery({ tags: "  " }), null);
    assert.equal(parseTagFilterQuery({}), null);
  });
});
