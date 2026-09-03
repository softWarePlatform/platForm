import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readStoredFileAbs, sanitizeFilename } from "../../src/lib/uploads.js";

describe("UC-04 文件名校验与存储路径", () => {
  it("UNIT-19-01：特殊字符替换为下划线，字母数字保留", () => {
    assert.equal(sanitizeFilename("my file!.txt"), "my_file_.txt");
  });

  it("UNIT-19-02：中文文件名保留", () => {
    assert.equal(sanitizeFilename("实验报告.docx"), "实验报告.docx");
  });

  it("UNIT-19-03：路径穿越字符被清理", () => {
    assert.equal(sanitizeFilename("../etc/passwd"), ".._etc_passwd");
  });

  it("UNIT-19-04：空文件名回退为 file，纯特殊字符被清理为下划线", () => {
    assert.equal(sanitizeFilename(""), "file");
    assert.equal(sanitizeFilename("///"), "___");
  });

  it("UNIT-19-05：超长文件名截断到 180 字符", () => {
    const long = "a".repeat(200) + ".txt";
    const safe = sanitizeFilename(long);
    assert.equal(safe.length, 180);
  });

  it("UNIT-19-06：readStoredFileAbs 拼接根目录并过滤空段", () => {
    const abs = readStoredFileAbs("courses//abc/x.txt");
    assert.ok(abs.endsWith("x.txt"));
    assert.ok(!abs.includes("//"));
  });
});
