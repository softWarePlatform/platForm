import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  attachmentExtAllowed,
  homeworkSettingsSchema,
  normalizeHomeworkSettingsInput,
  revisionSummary,
} from "../../src/lib/homework-settings.js";

describe("UC-05 作业设置规则", () => {
  it("UNIT-05-01：未配置可选项时使用安全默认值", () => {
    const normalized = normalizeHomeworkSettingsInput({});

    assert.equal(normalized.allowLate, false);
    assert.equal(normalized.latePenaltyPercentPerDay, null);
    assert.equal(normalized.allowRedo, false);
    assert.equal(normalized.maxRedoCount, null);
    assert.equal(normalized.submissionType, "INDIVIDUAL");
    assert.equal(normalized.maxGroupSize, null);
    assert.equal(normalized.answerMode, "RICH_TEXT");
    assert.equal(normalized.redoGradePolicy, "KEEP_MAX");
  });

  it("UNIT-05-02：迟交、重做和小组作业缺省参数被正确补齐", () => {
    const normalized = normalizeHomeworkSettingsInput({
      descriptionMd: "  完成设计说明  ",
      allowLate: true,
      allowRedo: true,
      submissionType: "GROUP",
    });

    assert.equal(normalized.descriptionMd, "完成设计说明");
    assert.equal(normalized.latePenaltyPercentPerDay, 10);
    assert.equal(normalized.lateMaxDays, 3);
    assert.equal(normalized.maxRedoCount, 1);
    assert.equal(normalized.maxGroupSize, 4);
  });

  it("UNIT-05-03：关闭迟交和重做后清除不应生效的旧参数", () => {
    const normalized = normalizeHomeworkSettingsInput({
      allowLate: false,
      latePenaltyPercentPerDay: 30,
      lateMaxDays: 7,
      allowRedo: false,
      maxRedoCount: 5,
      submissionType: "INDIVIDUAL",
      maxGroupSize: 8,
    });

    assert.equal(normalized.latePenaltyPercentPerDay, null);
    assert.equal(normalized.lateMaxDays, null);
    assert.equal(normalized.maxRedoCount, null);
    assert.equal(normalized.maxGroupSize, null);
  });

  it("UNIT-05-04：越界扣分比例和小组人数不能通过校验", () => {
    assert.equal(homeworkSettingsSchema.safeParse({ latePenaltyPercentPerDay: 101 }).success, false);
    assert.equal(homeworkSettingsSchema.safeParse({ maxGroupSize: 1 }).success, false);
  });

  it("UNIT-05-05：附件扩展名忽略大小写但拒绝未授权类型", () => {
    assert.equal(attachmentExtAllowed("作业说明.PDF"), true);
    assert.equal(attachmentExtAllowed("source.zip"), true);
    assert.equal(attachmentExtAllowed("run.exe"), false);
  });

  it("UNIT-05-06：修订摘要只列出发生变化的受控字段", () => {
    const summary = revisionSummary(
      { allowLate: false, dueAt: "2026-08-26" },
      { allowLate: true, dueAt: "2026-08-27" },
    );

    assert.equal(summary, "更新：dueAt、allowLate");
  });
});
