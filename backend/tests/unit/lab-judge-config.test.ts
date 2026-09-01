import assert from "node:assert/strict";
import { describe, it, test } from "node:test";
import {
  extensionAllowed,
  requireAllowedJudgeLanguage,
  requireSupportedJudgeLanguage,
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
      { judgeMode: "MANUAL", allowedLanguages: ["javascript"] },
      { judgeMode: "AUTO", allowedLanguages: ["python"] },
    );
    assert.equal(c.judgeMode, "MANUAL");
    assert.deepEqual(c.allowedLanguages, ["javascript"]);
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
    const c = resolveLabJudgeConfig(
      { judgeMode: "MANUAL", allowedLanguages: ["javascript"] },
      empty,
    );
    assert.deepEqual(serializeJudgeConfig(c), {
      judgeMode: "MANUAL",
      allowedLanguages: ["javascript"],
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

test("normalizes supported judge languages", () => {
  assert.equal(requireSupportedJudgeLanguage(" Python "), "python");
  assert.equal(requireSupportedJudgeLanguage("JAVASCRIPT"), "javascript");
});

test("rejects unsupported judge languages", () => {
  assert.throws(() => requireSupportedJudgeLanguage("java"), /不支持的评测语言/);
  assert.throws(() => requireSupportedJudgeLanguage("cpp"), /不支持的评测语言/);
});

test("rejects a supported language disabled for the lab", () => {
  assert.throws(
    () => requireAllowedJudgeLanguage("python", ["javascript"]),
    /本实验不允许使用 python/,
  );
});

test("filters unsupported languages from legacy judge configuration", () => {
  const config = resolveLabJudgeConfig(
    { allowedLanguages: ["javascript", "java", "cpp"] },
    { allowedLanguages: ["python"] },
  );

  assert.deepEqual(config.allowedLanguages, ["javascript"]);
});
