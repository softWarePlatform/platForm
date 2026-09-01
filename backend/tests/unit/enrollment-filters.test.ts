import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  OFFERING_COLLEGES,
  OFFERING_COLLEGE_LABELS,
  offeringCollegeLabel,
} from "../../src/lib/enrollment-filters.js";

describe("UC-10 开课学院字典", () => {
  it("UNIT-23-01：学院字典数量不少于 40 条", () => {
    assert.ok(OFFERING_COLLEGES.length >= 40);
  });

  it("UNIT-23-02：学院代码唯一", () => {
    const codes = OFFERING_COLLEGES.map((c) => c.code);
    assert.equal(new Set(codes).size, codes.length);
  });

  it("UNIT-23-03：已知代码映射为学院名称", () => {
    assert.equal(offeringCollegeLabel("6"), "计算机学院");
    assert.equal(OFFERING_COLLEGE_LABELS["42"], "人工智能研究院");
  });

  it("UNIT-23-04：未知代码原样返回，空值返回待定", () => {
    assert.equal(offeringCollegeLabel("999"), "999");
    assert.equal(offeringCollegeLabel(null), "待定开课单位");
    assert.equal(offeringCollegeLabel(undefined), "待定开课单位");
  });
});
