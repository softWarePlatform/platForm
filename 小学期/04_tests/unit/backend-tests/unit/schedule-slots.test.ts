import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deriveScheduleSlots,
  parseScheduleSlotsJson,
  scheduleSlotsBodySchema,
  serializeScheduleSlots,
  slotsConflict,
} from "../../src/lib/scheduleSlots.js";

describe("UC-01/UC-02 课程课表规则", () => {
  it("UNIT-01-01：相同星期且节次重叠时判定冲突", () => {
    const selected = [{ dayOfWeek: 1, periodStart: 1, periodEnd: 2, room: "A101" }];
    const candidate = [{ dayOfWeek: 1, periodStart: 2, periodEnd: 3, room: "B201" }];

    assert.equal(slotsConflict(selected, candidate), true);
  });

  it("UNIT-01-02：不同星期或不重叠节次不冲突", () => {
    const selected = [{ dayOfWeek: 1, periodStart: 1, periodEnd: 2, room: "A101" }];

    assert.equal(
      slotsConflict(selected, [{ dayOfWeek: 1, periodStart: 3, periodEnd: 4, room: "A102" }]),
      false,
    );
    assert.equal(
      slotsConflict(selected, [{ dayOfWeek: 2, periodStart: 1, periodEnd: 2, room: "A101" }]),
      false,
    );
  });

  it("UNIT-02-01：合法课表可解析、裁剪教室空格并序列化", () => {
    const json = JSON.stringify([
      { dayOfWeek: 3, periodStart: 5, periodEnd: 6, room: "  实验楼 B101  " },
    ]);
    const parsed = parseScheduleSlotsJson(json, "course-1");

    assert.deepEqual(parsed, [
      { dayOfWeek: 3, periodStart: 5, periodEnd: 6, room: "实验楼 B101" },
    ]);
    assert.equal(serializeScheduleSlots(parsed), JSON.stringify(parsed));
  });

  it("UNIT-02-02：非法或空课表回退为稳定占位课表", () => {
    const first = parseScheduleSlotsJson("not-json", "course-stable-id");
    const second = parseScheduleSlotsJson("[]", "course-stable-id");

    assert.deepEqual(first, deriveScheduleSlots("course-stable-id"));
    assert.deepEqual(second, first);
    assert.equal(scheduleSlotsBodySchema.safeParse(first).success, true);
  });

  it("UNIT-02-03：结束节次早于开始节次时校验失败", () => {
    const result = scheduleSlotsBodySchema.safeParse([
      { dayOfWeek: 1, periodStart: 5, periodEnd: 4, room: "A101" },
    ]);

    assert.equal(result.success, false);
  });
});
