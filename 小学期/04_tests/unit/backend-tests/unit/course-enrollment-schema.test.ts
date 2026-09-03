import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { courseEnrollmentFieldsSchema } from "../../src/lib/course-enrollment-schema.js";

const valid = {
  courseCode: "CS101",
  credits: 3,
  capacity: 60,
  courseNature: "ELECTIVE",
  subjectCategory: "CORE_MAJOR",
  offeringCollegeCode: "6",
  semesterKey: "2026-spring",
};

describe("UC-10 选课字段校验", () => {
  it("UNIT-14-01：完整合法字段通过校验", () => {
    assert.equal(courseEnrollmentFieldsSchema.safeParse(valid).success, true);
  });

  it("UNIT-14-02：可选字段缺省时校验通过", () => {
    assert.equal(courseEnrollmentFieldsSchema.safeParse({}).success, true);
  });

  it("UNIT-14-03：courseCode 空白或超长被拒绝", () => {
    assert.equal(courseEnrollmentFieldsSchema.safeParse({ courseCode: "   " }).success, false);
    assert.equal(
      courseEnrollmentFieldsSchema.safeParse({ courseCode: "C".repeat(33) }).success,
      false,
    );
  });

  it("UNIT-14-04：学分必须在 1-20 的整数范围内", () => {
    assert.equal(courseEnrollmentFieldsSchema.safeParse({ credits: 0 }).success, false);
    assert.equal(courseEnrollmentFieldsSchema.safeParse({ credits: 21 }).success, false);
    assert.equal(courseEnrollmentFieldsSchema.safeParse({ credits: 1.5 }).success, false);
    assert.equal(courseEnrollmentFieldsSchema.safeParse({ credits: 4 }).success, true);
  });

  it("UNIT-14-05：容量必须在 1-9999 范围内", () => {
    assert.equal(courseEnrollmentFieldsSchema.safeParse({ capacity: 0 }).success, false);
    assert.equal(courseEnrollmentFieldsSchema.safeParse({ capacity: 10000 }).success, false);
    assert.equal(courseEnrollmentFieldsSchema.safeParse({ capacity: 120 }).success, true);
  });

  it("UNIT-14-06：非法课程性质枚举被拒绝", () => {
    assert.equal(
      courseEnrollmentFieldsSchema.safeParse({ courseNature: "OPTIONAL" }).success,
      false,
    );
  });

  it("UNIT-14-07：非法学科分类枚举被拒绝", () => {
    assert.equal(
      courseEnrollmentFieldsSchema.safeParse({ subjectCategory: "UNKNOWN" }).success,
      false,
    );
  });

  it("UNIT-14-08：offeringCollegeCode 超过 8 字符被拒绝", () => {
    assert.equal(
      courseEnrollmentFieldsSchema.safeParse({ offeringCollegeCode: "123456789" }).success,
      false,
    );
    assert.equal(courseEnrollmentFieldsSchema.safeParse({ offeringCollegeCode: "6" }).success, true);
  });
});
