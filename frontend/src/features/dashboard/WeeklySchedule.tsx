import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import CustomEventEditor from "./CustomEventEditor";
import {
  draftFromEvent,
  draftToEvent,
  emptyCustomEventDraft,
  type CustomEventDraft,
} from "./customEventForm";
import type { CustomScheduleEvent, DashboardCourse, DashboardDeadline } from "./types";
import { PERIOD_OPTIONS } from "../../lib/schedulePeriods";
import { exportTimetableExcel } from "./exportTimetableExcel";
import { useConfirm } from "../../components/ui/ConfirmDialog";
import { coursePathForRole } from "../../lib/coursePaths";
import { loadCustomEvents, saveCustomEvents } from "./scheduleStorage";

const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const PERIODS = PERIOD_OPTIONS;

const COURSE_COLORS = ["#dbeafe", "#dcfce7", "#fef3c7", "#fce7f3", "#e0e7ff", "#ffedd5"];

function courseColor(courseId: string): string {
  let h = 0;
  for (let i = 0; i < courseId.length; i++) h = (h * 31 + courseId.charCodeAt(i)) >>> 0;
  return COURSE_COLORS[h % COURSE_COLORS.length];
}

type Cell = {
  key: string;
  courseId: string;
  customId?: string;
  title: string;
  teacher: string;
  room: string;
  note?: string;
  day: number;
  p0: number;
  p1: number;
  kind: "course" | "custom";
  color: string;
};

type Props = {
  courses: DashboardCourse[];
  deadlines: DashboardDeadline[];
  /** 嵌入选课系统等页面时使用 */
  embedded?: boolean;
  semesterLabel?: string;
  userName?: string;
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

export default function WeeklySchedule({
  courses,
  deadlines,
  embedded = false,
  semesterLabel = "",
  userName = "",
}: Props) {
  const { confirm } = useConfirm();
  const { user } = useAuth();
  const userId = user?.id;
  const [weekOffset, setWeekOffset] = useState(0);
  const [parity, setParity] = useState<"all" | "odd" | "even">("all");
  const [custom, setCustom] = useState<CustomScheduleEvent[]>(() => loadCustomEvents(userId));
  const [editorMode, setEditorMode] = useState<"add" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editorDraft, setEditorDraft] = useState<CustomEventDraft>(() => emptyCustomEventDraft());
  const [saveOk, setSaveOk] = useState(false);

  useEffect(() => {
    setCustom(loadCustomEvents(userId));
    setEditorMode(null);
    setEditingId(null);
  }, [userId]);

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
          color: courseColor(c.id),
        });
      }
    }

    for (const e of custom) {
      if (e.weekParity && e.weekParity !== "all" && e.weekParity !== parity && parity !== "all") continue;
      list.push({
        key: e.id,
        courseId: "",
        customId: e.id,
        title: e.title,
        teacher: "个人事项",
        room: e.room ?? "",
        note: e.note,
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

  function persistCustom(next: CustomScheduleEvent[]) {
    setCustom(next);
    saveCustomEvents(userId, next);
  }

  function closeEditor() {
    setEditorMode(null);
    setEditingId(null);
    setSaveOk(false);
  }

  function openAdd() {
    setEditorMode("add");
    setEditingId(null);
    setEditorDraft(
      emptyCustomEventDraft({
        weekParity: parity === "all" ? "all" : parity,
      }),
    );
    setSaveOk(false);
  }

  function openEdit(eventId: string) {
    const ev = custom.find((e) => e.id === eventId);
    if (!ev) return;
    setEditorMode("edit");
    setEditingId(eventId);
    setEditorDraft(draftFromEvent(ev));
    setSaveOk(false);
  }

  function saveEditor() {
    if (!editorDraft.title.trim()) return;
    if (editorDraft.periodEnd < editorDraft.periodStart) return;

    if (editorMode === "add") {
      const ev = draftToEvent(`custom-${Date.now()}`, editorDraft);
      persistCustom([...custom, ev]);
    } else if (editingId) {
      const ev = draftToEvent(editingId, editorDraft);
      persistCustom(custom.map((e) => (e.id === editingId ? ev : e)));
    }
    setSaveOk(true);
    window.setTimeout(() => {
      closeEditor();
    }, 800);
  }

  async function deleteEditor() {
    if (!editingId) return;
    const ok = await confirm({
      title: "删除事项",
      message: "确定删除该个人事项吗？",
      danger: true,
    });
    if (!ok) return;
    persistCustom(custom.filter((e) => e.id !== editingId));
    closeEditor();
  }

  const panelClass = embedded ? "enroll-timetable-panel" : "dash-panel";

  function handleExport() {
    exportTimetableExcel({
      courses,
      customEvents: custom,
      semesterLabel: semesterLabel || "当前学期",
      userName: userName || "用户",
    });
  }

  return (
    <section className={panelClass}>
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
          <button
            type="button"
            className="btn"
            onClick={() => (editorMode === "add" ? closeEditor() : openAdd())}
          >
            {editorMode === "add" ? "取消添加" : "添加事项"}
          </button>
          <button type="button" className="btn primary" onClick={handleExport}>
            导出 Excel
          </button>
        </div>
      </PanelHeader>

      {editorMode ? (
        <div style={{ marginBottom: 12 }}>
          <CustomEventEditor
            mode={editorMode}
            draft={editorDraft}
            setDraft={setEditorDraft}
            onSave={saveEditor}
            onCancel={closeEditor}
            onDelete={editorMode === "edit" ? deleteEditor : undefined}
            saveLabel={saveOk ? "已保存" : undefined}
          />
          {saveOk ? <div className="save-ok" style={{ marginTop: 8 }}>保存成功</div> : null}
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
            <ScheduleRow key={p} period={p} cells={cells} onCustomClick={openEdit} />
          ))}
        </div>
      </div>

      {weekDeadlines.length > 0 ? (
        <div className="dash-deadlines">
          <div style={{ fontWeight: 700, marginBottom: 6 }}>本周待办截止</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {weekDeadlines.map((d) => (
              <li key={`${d.type}-${d.id}`} style={{ marginBottom: 4 }}>
                <Link to={coursePathForRole(d.courseId, d.type === "labSet" ? "labs" : `homework/${d.id}`, user?.role)}>
                  {d.courseTitle} · {d.title}
                </Link>
                <span className="muted"> — {new Date(d.dueAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

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

function ScheduleRow({
  period,
  cells,
  onCustomClick,
}: {
  period: number;
  cells: Cell[];
  onCustomClick: (id: string) => void;
}) {
  return (
    <>
      <div className="schedule-period">{period}</div>
      {WEEKDAYS.map((_, dayIdx) => {
        const day = dayIdx + 1;
        const hit = cells.find((c) => c.day === day && period >= c.p0 && period <= c.p1);
        if (!hit) {
          return <div key={`${day}-${period}`} className="schedule-cell" />;
        }
        const isStart = period === hit.p0;
        const isEnd = period === hit.p1;
        const spanClass = [
          "schedule-cell",
          "schedule-cell--filled",
          isStart && isEnd
            ? "schedule-cell--span-single"
            : isStart
              ? "schedule-cell--span-start"
              : isEnd
                ? "schedule-cell--span-end"
                : "schedule-cell--span-mid",
        ].join(" ");

        return (
          <div
            key={`${day}-${period}`}
            className={spanClass}
            style={{ background: hit.color, borderColor: hit.color }}
          >
            <ScheduleCellContent
              hit={hit}
              spanEnd={hit.p1}
              isStart={isStart}
              onCustomClick={onCustomClick}
            />
          </div>
        );
      })}
    </>
  );
}

function ScheduleCellContent({
  hit,
  spanEnd,
  isStart,
  onCustomClick,
}: {
  hit: Cell;
  spanEnd: number;
  isStart: boolean;
  onCustomClick: (id: string) => void;
}) {
  const periodLabel =
    hit.p0 === spanEnd ? `第 ${hit.p0} 节` : `第 ${hit.p0}–${spanEnd} 节`;
  const fillClass = isStart ? "" : " schedule-event--span-fill";

  if (hit.kind === "course" && hit.courseId) {
    return (
      <Link
        to={coursePathForRole(hit.courseId, "announcements", "STUDENT")}
        className={`schedule-event schedule-event--course${fillClass}`}
        style={{ background: isStart ? hit.color : "transparent", textDecoration: "none", color: "inherit" }}
        title={isStart ? undefined : hit.title}
      >
        {isStart ? (
          <>
            <div style={{ fontWeight: 700, fontSize: 12 }}>{hit.title}</div>
            <div className="muted" style={{ fontSize: 11 }}>
              {periodLabel} · {hit.room || "—"}
            </div>
            <div className="muted" style={{ fontSize: 11 }}>
              {hit.teacher}
            </div>
          </>
        ) : (
          <span className="schedule-event__sr">{hit.title}</span>
        )}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={`schedule-event schedule-event--custom${fillClass}`}
      style={{ background: isStart ? hit.color : "transparent" }}
      onClick={() => hit.customId && onCustomClick(hit.customId)}
      aria-label={isStart ? undefined : `编辑：${hit.title}`}
      title={isStart ? "点击编辑" : hit.title}
    >
      {isStart ? (
        <>
          <div style={{ fontWeight: 700, fontSize: 12 }}>{hit.title}</div>
          <div className="muted" style={{ fontSize: 11 }}>
            {periodLabel} · {hit.room || "—"}
          </div>
          {hit.note ? (
            <div className="muted" style={{ fontSize: 11, marginTop: 2 }} title={hit.note}>
              {hit.note.length > 24 ? `${hit.note.slice(0, 24)}…` : hit.note}
            </div>
          ) : (
            <div className="muted" style={{ fontSize: 11 }}>
              点击编辑
            </div>
          )}
        </>
      ) : null}
    </button>
  );
}
