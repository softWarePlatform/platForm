import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { Link } from "react-router-dom";
import type { CustomScheduleEvent, DashboardCourse, DashboardDeadline } from "./types";
import { loadCustomEvents, saveCustomEvents } from "./scheduleStorage";

const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];

type Cell = {
  key: string;
  courseId: string;
  title: string;
  teacher: string;
  room: string;
  day: number;
  p0: number;
  p1: number;
  kind: "course" | "custom";
  color: string;
};

type Props = {
  courses: DashboardCourse[];
  deadlines: DashboardDeadline[];
};

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = x.getDay() || 7;
  x.setDate(x.getDate() - day + 1);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function weekParity(d: Date): "odd" | "even" {
  const w = Math.floor(startOfWeek(d).getTime() / (7 * 86400000));
  return w % 2 === 0 ? "even" : "odd";
}

export default function WeeklySchedule({ courses, deadlines }: Props) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [parity, setParity] = useState<"all" | "odd" | "even">("all");
  const [custom, setCustom] = useState<CustomScheduleEvent[]>(() => loadCustomEvents());
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState({
    title: "",
    dayOfWeek: 1,
    periodStart: 3,
    periodEnd: 4,
    room: "",
  });

  const anchor = useMemo(() => addDays(startOfWeek(new Date()), weekOffset * 7), [weekOffset]);
  const weekLabel = useMemo(() => {
    const end = addDays(anchor, 6);
    const f = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
    return `${f(anchor)} – ${f(end)}`;
  }, [anchor]);

  const cells = useMemo(() => {
    const list: Cell[] = [];
    const wp = weekParity(anchor);

    for (const c of courses) {
      for (const slot of c.scheduleSlots) {
        if (parity === "odd" && wp === "even") continue;
        if (parity === "even" && wp === "odd") continue;
        list.push({
          key: `c-${c.id}-${slot.dayOfWeek}-${slot.periodStart}`,
          courseId: c.id,
          title: c.title,
          teacher: c.teacherName,
          room: slot.room,
          day: slot.dayOfWeek,
          p0: slot.periodStart,
          p1: slot.periodEnd,
          kind: "course",
          color: "#dbeafe",
        });
      }
    }

    for (const e of custom) {
      if (e.weekParity && e.weekParity !== "all" && e.weekParity !== parity && parity !== "all") continue;
      list.push({
        key: e.id,
        courseId: "",
        title: e.title,
        teacher: "自定义",
        room: e.room ?? "",
        day: e.dayOfWeek,
        p0: e.periodStart,
        p1: e.periodEnd,
        kind: "custom",
        color: e.color,
      });
    }

    return list;
  }, [courses, custom, parity, anchor]);

  const weekDeadlines = useMemo(() => {
    const start = anchor.getTime();
    const end = addDays(anchor, 7).getTime();
    return deadlines.filter((d) => {
      const t = new Date(d.dueAt).getTime();
      return t >= start && t < end;
    });
  }, [deadlines, anchor]);

  function addCustom() {
    if (!draft.title.trim()) return;
    const ev: CustomScheduleEvent = {
      id: `custom-${Date.now()}`,
      title: draft.title.trim(),
      dayOfWeek: draft.dayOfWeek,
      periodStart: draft.periodStart,
      periodEnd: Math.max(draft.periodEnd, draft.periodStart),
      room: draft.room.trim() || undefined,
      color: "#fef3c7",
      weekParity: parity === "all" ? "all" : parity,
    };
    const next = [...custom, ev];
    setCustom(next);
    saveCustomEvents(next);
    setShowAdd(false);
    setDraft({ title: "", dayOfWeek: 1, periodStart: 3, periodEnd: 4, room: "" });
  }

  return (
    <section className="dash-panel">
      <PanelHeader title="个人课表">
        <div className="row" style={{ flexWrap: "wrap" }}>
          <button type="button" className="btn" onClick={() => setWeekOffset((w) => w - 1)}>
            上一周
          </button>
          <span className="muted" style={{ minWidth: 120, textAlign: "center" }}>
            {weekLabel}
          </span>
          <button type="button" className="btn" onClick={() => setWeekOffset(0)}>
            本周
          </button>
          <button type="button" className="btn" onClick={() => setWeekOffset((w) => w + 1)}>
            下一周
          </button>
          <select
            className="dash-select"
            value={parity}
            onChange={(e) => setParity(e.target.value as typeof parity)}
          >
            <option value="all">每周</option>
            <option value="odd">单周</option>
            <option value="even">双周</option>
          </select>
          <button type="button" className="btn" onClick={() => setShowAdd((v) => !v)}>
            添加事项
          </button>
          <button type="button" className="btn muted-btn" disabled title="导出功能规划中">
            导出课表
          </button>
        </div>
      </PanelHeader>

      {showAdd ? (
        <div className="card" style={{ marginBottom: 12, boxShadow: "none", padding: 12 }}>
          <AddEventRow draft={draft} setDraft={setDraft} onAdd={addCustom} onCancel={() => setShowAdd(false)} />
        </div>
      ) : null}

      <div style={{ overflowX: "auto" }}>
        <div className="schedule-grid">
          <div className="schedule-period">节次</div>
          {WEEKDAYS.map((w) => (
            <div key={w} className="schedule-head">
              {w}
            </div>
          ))}
          {PERIODS.map((p) => (
            <ScheduleRow key={p} period={p} cells={cells} />
          ))}
        </div>
      </div>

      {weekDeadlines.length > 0 ? (
        <div className="dash-deadlines">
          <div style={{ fontWeight: 700, marginBottom: 6 }}>本周待办截止</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {weekDeadlines.map((d) => (
              <li key={`${d.type}-${d.id}`} style={{ marginBottom: 4 }}>
                <Link to={`/courses/${d.courseId}/announcements`}>
                  {d.courseTitle} · {d.title}
                </Link>
                <span className="muted"> — {new Date(d.dueAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="muted" style={{ marginTop: 10, fontSize: 12 }}>
        选课/退课后课表中的课程会随「我的课程」更新；上课时间目前为演示数据，完整课表待选课模块扩展后接入。
      </p>
    </section>
  );
}

function PanelHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="spread" style={{ marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
      <h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2>
      {children}
    </div>
  );
}

function AddEventRow({
  draft,
  setDraft,
  onAdd,
  onCancel,
}: {
  draft: { title: string; dayOfWeek: number; periodStart: number; periodEnd: number; room: string };
  setDraft: Dispatch<SetStateAction<typeof draft>>;
  onAdd: () => void;
  onCancel: () => void;
}) {
  const inputStyle = { padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)" };
  return (
    <div className="row" style={{ flexWrap: "wrap" }}>
      <input
        placeholder="事项名称（自习、组会…）"
        value={draft.title}
        onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
        style={{ ...inputStyle, flex: 1, minWidth: 160 }}
      />
      <select
        value={draft.dayOfWeek}
        onChange={(e) => setDraft((d) => ({ ...d, dayOfWeek: Number(e.target.value) }))}
        className="dash-select"
      >
        {WEEKDAYS.map((w, i) => (
          <option key={w} value={i + 1}>
            {w}
          </option>
        ))}
      </select>
      <span className="muted">第</span>
      <input
        type="number"
        min={1}
        max={8}
        value={draft.periodStart}
        onChange={(e) => setDraft((d) => ({ ...d, periodStart: Number(e.target.value) }))}
        style={{ ...inputStyle, width: 48 }}
      />
      <span className="muted">–</span>
      <input
        type="number"
        max={8}
        min={1}
        value={draft.periodEnd}
        onChange={(e) => setDraft((d) => ({ ...d, periodEnd: Number(e.target.value) }))}
        style={{ ...inputStyle, width: 48 }}
      />
      <span className="muted">节</span>
      <input
        placeholder="地点"
        value={draft.room}
        onChange={(e) => setDraft((d) => ({ ...d, room: e.target.value }))}
        style={{ ...inputStyle, width: 100 }}
      />
      <button type="button" className="btn primary" onClick={onAdd}>
        保存
      </button>
      <button type="button" className="btn" onClick={onCancel}>
        取消
      </button>
    </div>
  );
}

function ScheduleRow({ period, cells }: { period: number; cells: Cell[] }) {
  return (
    <>
      <div className="schedule-period">{period}</div>
      {WEEKDAYS.map((_, dayIdx) => {
        const day = dayIdx + 1;
        const hit = cells.find((c) => c.day === day && period >= c.p0 && period <= c.p1);
        if (!hit || hit.p0 !== period) {
          return <div key={`${day}-${period}`} className="schedule-cell" />;
        }
        return (
          <div key={`${day}-${period}`} className="schedule-cell schedule-cell--filled">
            <ScheduleEvent hit={hit} />
          </div>
        );
      })}
    </>
  );
}

function ScheduleEvent({ hit }: { hit: Cell }) {
  const body = (
    <>
      <div style={{ fontWeight: 700, fontSize: 12 }}>{hit.title}</div>
      <div className="muted" style={{ fontSize: 11 }}>
        {hit.p0}–{hit.p1} 节 · {hit.room || "—"}
      </div>
      <div className="muted" style={{ fontSize: 11 }}>
        {hit.teacher}
      </div>
    </>
  );

  if (hit.kind === "course" && hit.courseId) {
    return (
      <Link
        to={`/courses/${hit.courseId}/announcements`}
        className="schedule-event"
        style={{ background: hit.color, display: "block", textDecoration: "none", color: "inherit" }}
      >
        {body}
      </Link>
    );
  }

  return (
    <div className="schedule-event" style={{ background: hit.color }}>
      {body}
    </div>
  );
}
