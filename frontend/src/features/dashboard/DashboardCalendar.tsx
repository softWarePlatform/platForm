import { useMemo } from "react";
import { Link } from "react-router-dom";
import type { DashboardCourse, DashboardDeadline } from "./types";

type Props = {
  courses: DashboardCourse[];
  deadlines: DashboardDeadline[];
};

type DayEvent = {
  id: string;
  title: string;
  sub: string;
  time: string;
  tone: "blue" | "purple" | "teal" | "amber";
  link: string;
};

const WEEK_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

function periodLabel(start: number, end: number) {
  return start === end ? `第 ${start} 节` : `第 ${start}–${end} 节`;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function daysInMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

export default function DashboardCalendar({ courses, deadlines }: Props) {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const totalDays = daysInMonth(now);
  const startPad = monthStart.getDay();
  const today = now.getDate();

  const { todayEvents, tomorrowEvents } = useMemo(() => {
    const jsDay = now.getDay();
    const todayDow = jsDay === 0 ? 7 : jsDay;
    const tomorrowDow = todayDow === 7 ? 1 : todayDow + 1;

    const classEvents: DayEvent[] = [];
    for (const c of courses) {
      if (c.isHistory) continue;
      for (const slot of c.scheduleSlots) {
        const time = periodLabel(slot.periodStart, slot.periodEnd);
        const base = {
          title: c.title,
          sub: slot.room || c.teacherName,
          time,
        };
        if (slot.dayOfWeek === todayDow) {
          classEvents.push({
            id: `c-${c.id}-${slot.dayOfWeek}-${slot.periodStart}-t`,
            ...base,
            tone: "blue",
            link: `/courses/${c.id}`,
          });
        }
        if (slot.dayOfWeek === tomorrowDow) {
          classEvents.push({
            id: `c-${c.id}-${slot.dayOfWeek}-${slot.periodStart}-m`,
            ...base,
            tone: "teal",
            link: `/courses/${c.id}`,
          });
        }
      }
    }

    const todayDeadlines: DayEvent[] = [];
    const tomorrowDeadlines: DayEvent[] = [];
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const dayAfter = new Date(tomorrowStart);
    dayAfter.setDate(dayAfter.getDate() + 1);

    for (const d of deadlines) {
      const due = new Date(d.dueAt);
      const item: DayEvent = {
        id: `d-${d.type}-${d.id}`,
        title: d.title,
        sub: d.courseTitle,
        time: due.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
        tone: d.type === "labSet" ? "purple" : "amber",
        link: `/courses/${d.courseId}/${d.type === "labSet" ? "labs" : "homework"}`,
      };
      if (due >= todayStart && due < tomorrowStart) todayDeadlines.push(item);
      else if (due >= tomorrowStart && due < dayAfter) tomorrowDeadlines.push(item);
    }

    return {
      todayEvents: [...classEvents.filter((e) => e.id.endsWith("-t")), ...todayDeadlines],
      tomorrowEvents: [...classEvents.filter((e) => e.id.endsWith("-m")), ...tomorrowDeadlines],
    };
  }, [courses, deadlines, now]);

  const monthTitle = now.toLocaleDateString("zh-CN", { year: "numeric", month: "long" });

  return (
    <aside className="dash-glass-panel dash-calendar">
      <div className="dash-section-head dash-section-head--compact">
        <h2 className="dash-section-head__title">课程日历</h2>
        <Link className="dash-link-more" to="/enrollment">
          查看全部 →
        </Link>
      </div>

      <div className="dash-mini-cal">
        <div className="dash-mini-cal__month">{monthTitle}</div>
        <div className="dash-mini-cal__weekdays">
          {WEEK_LABELS.map((w) => (
            <span key={w}>{w}</span>
          ))}
        </div>
        <div className="dash-mini-cal__days">
          {Array.from({ length: startPad }).map((_, i) => (
            <span key={`pad-${i}`} className="dash-mini-cal__day dash-mini-cal__day--empty" />
          ))}
          {Array.from({ length: totalDays }).map((_, i) => {
            const day = i + 1;
            const isToday = day === today;
            return (
              <span
                key={day}
                className={`dash-mini-cal__day${isToday ? " dash-mini-cal__day--today" : ""}`}
              >
                {day}
              </span>
            );
          })}
        </div>
      </div>

      <EventGroup label="今天" events={todayEvents} />
      <EventGroup label="明天" events={tomorrowEvents} />
    </aside>
  );
}

function EventGroup({ label, events }: { label: string; events: DayEvent[] }) {
  return (
    <div className="dash-cal-group">
      <h3 className="dash-cal-group__label">{label}</h3>
      {events.length === 0 ? (
        <p className="dash-cal-group__empty muted">暂无安排</p>
      ) : (
        <ul className="dash-cal-list">
          {events.map((e) => (
            <li key={e.id}>
              <Link to={e.link} className={`dash-cal-item dash-cal-item--${e.tone}`}>
                <span className="dash-cal-item__bar" />
                <span className="dash-cal-item__main">
                  <span className="dash-cal-item__title">{e.title}</span>
                  <span className="dash-cal-item__sub">
                    {e.time} · {e.sub}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
