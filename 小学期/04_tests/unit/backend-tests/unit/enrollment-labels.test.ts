import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { offeringCollegeLabel } from "../../src/lib/enrollment-filters.js";
import {
  formatScheduleDetail,
  formatScheduleSummary,
  getEnrollmentFilterOptions,
} from "../../src/lib/enrollment-labels.js";

describe("UC-10 选课管理展示规则", () => {
  it("UNIT-10-01：学院代码映射为名称，未知代码和空值安全回退", () => {
    assert.equal(offeringCollegeLabel("6"), "计算机学院");
    assert.equal(offeringCollegeLabel("X"), "X");
    assert.equal(offeringCollegeLabel(null), "待定开课单位");
  });

  it("UNIT-10-02：筛选选项包含课程性质、学科分类和学院列表", () => {
    const options = getEnrollmentFilterOptions();
    assert.equal(options.courseNatures.REQUIRED, "必修");
    assert.equal(options.subjectCategories.CORE_MAJOR, "核心专业类");
    assert.ok(options.offeringCollegeList.length >= 40);
  });

  it("UNIT-10-03：课表摘要正确格式化星期、节次和教室", () => {
    assert.equal(
      formatScheduleSummary([{ dayOfWeek: 1, periodStart: 3, periodEnd: 4, room: "主楼101" }]),
      "周一 第3-4节 主楼101",
    );
    assert.equal(formatScheduleSummary([]), "时间待定");
  });

  it("UNIT-10-04：课表详情补齐周次、教师和缺省教室", () => {
    assert.equal(
      formatScheduleDetail(
        [{ dayOfWeek: 5, periodStart: 1, periodEnd: 2, room: "" }],
        "范老师",
        "1-8周[理论]",
      ),
      "1-8周[理论]/周五/第1节-第2节/范老师[主讲]/教室待定",
    );
  });
});
