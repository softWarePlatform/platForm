import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { gradePracticeAnswer, parseAnswerJson } from "../../src/lib/practice-grade.js";

describe("UC-07 练习判分规则", () => {
  it("UNIT-07-01：选择题答案匹配时得满分", async () => {
    const result = await gradePracticeAnswer(
      { type: "CHOICE", answerJson: JSON.stringify({ choiceId: "b" }), language: null },
      JSON.stringify("b"),
    );

    assert.equal(result.correct, true);
    assert.equal(result.score, 1);
  });

  it("UNIT-07-02：填空题忽略大小写和连续空格", async () => {
    const result = await gradePracticeAnswer(
      { type: "FILL", answerJson: JSON.stringify({ blanks: ["Binary   Tree"] }), language: null },
      JSON.stringify(" binary tree "),
    );

    assert.equal(result.correct, true);
    assert.equal(result.score, 1);
  });

  it("UNIT-07-03：未作答返回零分和明确原因", async () => {
    const result = await gradePracticeAnswer(
      { type: "CHOICE", answerJson: JSON.stringify({ choiceId: "a" }), language: null },
      null,
    );

    assert.deepEqual(result, {
      correct: false,
      score: 0,
      maxScore: 1,
      detail: { reason: "未作答" },
    });
  });

  it("UNIT-07-04：简答题空字符串不能利用包含关系误判正确", async () => {
    const result = await gradePracticeAnswer(
      { type: "SHORT_ANSWER", answerJson: JSON.stringify({ text: "软件生命周期" }), language: null },
      JSON.stringify(""),
    );

    assert.equal(result.correct, false);
    assert.equal(result.score, 0.5);
  });

  it("UNIT-07-05：非法 JSON 按普通文本处理", () => {
    assert.equal(parseAnswerJson("plain answer"), "plain answer");
  });
});
