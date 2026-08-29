import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  appendEditHistory,
  isEdited,
  isNewAnnouncement,
  parseEditHistory,
} from "../../src/lib/announcements.js";

describe("UC-03 公告编辑与状态规则", () => {
  it("UNIT-03-01：空值、非法 JSON 和非数组历史安全回退为空数组", () => {
    assert.deepEqual(parseEditHistory(null), []);
    assert.deepEqual(parseEditHistory("not-json"), []);
    assert.deepEqual(parseEditHistory('{"title":"x"}'), []);
  });

  it("UNIT-03-02：追加编辑历史会保留旧记录并写入 ISO 时间", () => {
    const existing = JSON.stringify([{ at: "2026-08-26T00:00:00.000Z", title: "旧标题" }]);
    const history = parseEditHistory(appendEditHistory(existing, { title: "新标题", pinned: true }));

    assert.equal(history.length, 2);
    assert.deepEqual(history[0], { at: "2026-08-26T00:00:00.000Z", title: "旧标题" });
    assert.equal(history[1]?.title, "新标题");
    assert.equal(history[1]?.pinned, true);
    assert.match(history[1]?.at ?? "", /^\d{4}-\d{2}-\d{2}T/);
  });

  it("UNIT-03-03：有编辑历史或更新时间超过容差时标记已编辑", () => {
    const createdAt = new Date("2026-08-27T01:00:00.000Z");
    assert.equal(isEdited(createdAt, new Date("2026-08-27T01:00:01.000Z"), null), false);
    assert.equal(isEdited(createdAt, new Date("2026-08-27T01:00:03.000Z"), null), true);
    assert.equal(
      isEdited(createdAt, createdAt, '[{"at":"2026-08-27T01:00:00.000Z","content":"修订"}]'),
      true,
    );
  });

  it("UNIT-03-04：24 小时内公告为新公告，超过窗口则不是", () => {
    assert.equal(isNewAnnouncement(new Date(Date.now() - 23 * 60 * 60 * 1000)), true);
    assert.equal(isNewAnnouncement(new Date(Date.now() - 25 * 60 * 60 * 1000)), false);
  });
});
