import { PERIOD_OPTIONS } from "../lib/schedulePeriods";

export type ScheduleSlotDraft = {
  dayOfWeek: number;
  periodStart: number;
  periodEnd: number;
  room: string;
};

export const WEEKDAY_OPTIONS = [
  { value: 1, label: "周一" },
  { value: 2, label: "周二" },
  { value: 3, label: "周三" },
  { value: 4, label: "周四" },
  { value: 5, label: "周五" },
  { value: 6, label: "周六" },
  { value: 7, label: "周日" },
];

export { PERIOD_OPTIONS };

export function emptyScheduleSlot(): ScheduleSlotDraft {
  return { dayOfWeek: 1, periodStart: 1, periodEnd: 2, room: "" };
}

export function slotsFromCourse(course: {
  scheduleSlots?: ScheduleSlotDraft[];
}): ScheduleSlotDraft[] {
  if (course.scheduleSlots?.length) {
    return course.scheduleSlots.map((s) => ({ ...s }));
  }
  return [emptyScheduleSlot()];
}

export function formatScheduleSummary(slots: ScheduleSlotDraft[]): string {
  if (!slots.length) return "未设置上课时间";
  return slots
    .map((s) => {
      const day = WEEKDAY_OPTIONS.find((d) => d.value === s.dayOfWeek)?.label ?? `周${s.dayOfWeek}`;
      const period =
        s.periodStart === s.periodEnd
          ? `第 ${s.periodStart} 节`
          : `第 ${s.periodStart}–${s.periodEnd} 节`;
      const room = s.room.trim() ? ` · ${s.room.trim()}` : "";
      return `${day} ${period}${room}`;
    })
    .join("；");
}

type Props = {
  slots: ScheduleSlotDraft[];
  onChange: (slots: ScheduleSlotDraft[]) => void;
};

export default function CourseScheduleFields({ slots, onChange }: Props) {
  function updateAt(index: number, patch: Partial<ScheduleSlotDraft>) {
    onChange(slots.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  return (
    <div className="grid" style={{ gap: 12 }}>
      {slots.map((slot, index) => (
        <div
          key={index}
          className="grid"
          style={{
            gap: 10,
            padding: 12,
            border: "1px solid var(--border)",
            borderRadius: 8,
            background: "#fafbfc",
          }}
        >
          <div className="spread" style={{ alignItems: "center" }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>上课时间 {index + 1}</span>
            {slots.length > 1 ? (
              <button
                type="button"
                className="btn"
                style={{ fontSize: 12, padding: "4px 10px" }}
                onClick={() => onChange(slots.filter((_, i) => i !== index))}
              >
                删除
              </button>
            ) : null}
          </div>
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
            <div className="field" style={{ margin: 0 }}>
              <label>星期</label>
              <select
                value={slot.dayOfWeek}
                onChange={(e) => updateAt(index, { dayOfWeek: Number(e.target.value) })}
              >
                {WEEKDAY_OPTIONS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>开始节次</label>
              <select
                value={slot.periodStart}
                onChange={(e) => {
                  const periodStart = Number(e.target.value);
                  const periodEnd = Math.max(periodStart, slot.periodEnd);
                  updateAt(index, { periodStart, periodEnd });
                }}
              >
                {PERIOD_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    第 {p} 节
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>结束节次</label>
              <select
                value={slot.periodEnd}
                onChange={(e) => updateAt(index, { periodEnd: Number(e.target.value) })}
              >
                {PERIOD_OPTIONS.filter((p) => p >= slot.periodStart).map((p) => (
                  <option key={p} value={p}>
                    第 {p} 节
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>教室（可选）</label>
              <input
                value={slot.room}
                onChange={(e) => updateAt(index, { room: e.target.value })}
                placeholder="如 教学楼 A301"
              />
            </div>
          </div>
        </div>
      ))}
      <button
        type="button"
        className="btn"
        style={{ width: "fit-content" }}
        onClick={() => onChange([...slots, emptyScheduleSlot()])}
      >
        + 添加上课时段
      </button>
    </div>
  );
}
