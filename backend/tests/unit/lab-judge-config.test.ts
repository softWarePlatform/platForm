import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extensionAllowed,
  resolveLabJudgeConfig,
  serializeJudgeConfig,
} from "../../src/lib/lab-judge-config.js";

const empty = {};

describe("UC-06 实验批改配置解析", () => {
  it("UNIT-16-01：全空时使用默认配置", () => {
    const c = resolveLabJudgeConfig(empty, empty);
    assert.equal(c.judgeMode, "AUTO");
    assert.deepEqual(c.allowedLanguages, ["python", "javascript"]);
    assert.deepEqual(c.allowedFileExtensions, [".py", ".js", ".ts", ".java", ".cpp", ".c", ".txt"]);
  });

  it("UNIT-16-02：Lab 配置优先于 LabSet 配置", () => {
    const c = resolveLabJudgeConfig(
      { judgeMode: "MANUAL", allowedLanguages: ["java"] },
      { judgeMode: "AUTO", allowedLanguages: ["python"] },
    );
    assert.equal(c.judgeMode, "MANUAL");
    assert.deepEqual(c.allowedLanguages, ["java"]);
  });

  it("UNIT-16-03：Lab 未配置时回退到 LabSet", () => {
    const c = resolveLabJudgeConfig(empty, {
      judgeMode: "MANUAL",
      allowedFileExtensions: [".cpp"],
    });
    assert.equal(c.judgeMode, "MANUAL");
    assert.deepEqual(c.allowedFileExtensions, [".cpp"]);
  });

  it("UNIT-16-04：Lab 与 LabSet 均为空数组时回退默认语言与扩展名", () => {
    const c = resolveLabJudgeConfig({ allowedLanguages: [] }, { allowedFileExtensions: [] });
    assert.deepEqual(c.allowedLanguages, ["python", "javascript"]);
    assert.deepEqual(c.allowedFileExtensions, [".py", ".js", ".ts", ".java", ".cpp", ".c", ".txt"]);
  });

  it("UNIT-16-05：扩展名匹配忽略大小写且兼容省略点号", () => {
    assert.equal(extensionAllowed("Main.PY", [".py"]), true);
    assert.equal(extensionAllowed("main.cpp", ["cpp"]), true);
    assert.equal(extensionAllowed("main.py", [".PY"]), true);
  });

  it("UNIT-16-06：不匹配的扩展名返回 false", () => {
    assert.equal(extensionAllowed("main.exe", [".py", ".js"]), false);
    assert.equal(extensionAllowed("noext", [".py"]), false);
  });

  it("UNIT-16-07：serializeJudgeConfig 返回相同的三个字段", () => {
    const c = resolveLabJudgeConfig({ judgeMode: "MANUAL", allowedLanguages: ["js"] }, empty);
    assert.deepEqual(serializeJudgeConfig(c), {
      judgeMode: "MANUAL",
      allowedLanguages: ["js"],
      allowedFileExtensions: [".py", ".js", ".ts", ".java", ".cpp", ".c", ".txt"],
    });
  });

  it("UNIT-16-08：null 值按未配置处理", () => {
    const c = resolveLabJudgeConfig({ judgeMode: null, allowedLanguages: null }, {
      allowedLanguages: null,
    } as never);
    assert.equal(c.judgeMode, "AUTO");
    assert.deepEqual(c.allowedLanguages, ["python", "javascript"]);
  });
});
