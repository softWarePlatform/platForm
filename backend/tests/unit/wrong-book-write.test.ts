import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deduplicateWrongBookItems,
  homeworkWrongBookSourceKey,
} from "../../src/lib/wrong-book-write.js";

describe("B-03 错题内部写入规则", () => {
  it("同一标题重复出现时只保留最后一项", () => {
    assert.deepEqual(
      deduplicateWrongBookItems([
        { title: "  数组边界  ", content: "旧内容" },
        { title: "数组边界", content: "  新内容  " },
        { title: "递归终止", content: "缺少终止条件" },
      ]),
      [
        { title: "数组边界", content: "新内容" },
        { title: "递归终止", content: "缺少终止条件" },
      ],
    );
  });

  it("同一来源生成稳定幂等键，不同标题不会冲突", () => {
    const first = homeworkWrongBookSourceKey("user-1", "homework-1", "数组边界");
    assert.equal(first, homeworkWrongBookSourceKey("user-1", "homework-1", "数组边界"));
    assert.notEqual(first, homeworkWrongBookSourceKey("user-1", "homework-1", "递归终止"));
    assert.match(first, /^[a-f0-9]{64}$/);
  });
});
