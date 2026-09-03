import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AI_ANSWER_DISCLAIMER,
  answerSourceLabel,
  pickAnswerMetaForCreate,
  serializeAnswerMeta,
} from "../../src/lib/practice-answer-meta.js";

describe("UC-07 练习答案来源标记", () => {
  it("UNIT-18-01：教师已确认答案标记为「教师提供」", () => {
    assert.equal(answerSourceLabel("TEACHER", true), "教师提供");
  });

  it("UNIT-18-02：AI 未确认答案使用免责声明", () => {
    assert.equal(answerSourceLabel("AI", false), AI_ANSWER_DISCLAIMER);
  });

  it("UNIT-18-03：AI 已确认答案标记为教师确认", () => {
    assert.equal(answerSourceLabel("AI", true), "教师确认（原 AI 建议）");
  });

  it("UNIT-18-04：教师未确认答案返回 null", () => {
    assert.equal(answerSourceLabel("TEACHER", false), null);
  });

  it("UNIT-18-05：教师提供答案或文档导入时强制为已确认教师答案", () => {
    assert.deepEqual(pickAnswerMetaForCreate({ teacherProvidedAnswer: true }), {
      answerSource: "TEACHER",
      answerConfirmed: true,
    });
    assert.deepEqual(
      pickAnswerMetaForCreate({ teacherProvidedAnswer: false, answerFromDocument: true }),
      {
        answerSource: "TEACHER",
        answerConfirmed: true,
      },
    );
  });

  it("UNIT-18-06：显式 AI 来源标记为未确认", () => {
    assert.deepEqual(pickAnswerMetaForCreate({ teacherProvidedAnswer: false, answerSource: "AI" }), {
      answerSource: "AI",
      answerConfirmed: false,
    });
  });

  it("UNIT-18-07：缺省来源为已确认教师答案", () => {
    assert.deepEqual(pickAnswerMetaForCreate({ teacherProvidedAnswer: false }), {
      answerSource: "TEACHER",
      answerConfirmed: true,
    });
  });

  it("UNIT-18-08：serializeAnswerMeta 附带展示标签", () => {
    assert.deepEqual(serializeAnswerMeta({ answerSource: "AI", answerConfirmed: false }), {
      answerSource: "AI",
      answerConfirmed: false,
      answerLabel: AI_ANSWER_DISCLAIMER,
    });
  });
});
