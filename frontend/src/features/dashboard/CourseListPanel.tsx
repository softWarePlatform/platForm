import { useEffect, useMemo, useState, type DragEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { COURSE_GROUP_META, type CourseGroupKey, type DashboardCourse } from "./types";
import { groupCourses } from "./courseGrouping";
import { loadCourseOrder, saveCourseOrder } from "./scheduleStorage";

type Props = {
  courses: DashboardCourse[];
  semesterLabel: string;
};

export default function CourseListPanel({ courses, semesterLabel }: Props) {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const userId = user?.id;
  const [order, setOrder] = useState<string[]>(() => loadCourseOrder(user?.id));

  useEffect(() => {
    setOrder(loadCourseOrder(userId));
  }, [userId]);
  const [dragId, setDragId] = useState<string | null>(null);

  const sorted = useMemo(() => {
    if (order.length === 0) return courses;
    const map = new Map(courses.map((c) => [c.id, c]));
    const out: DashboardCourse[] = [];
    for (const id of order) {
      const c = map.get(id);
      if (c) out.push(c);
      map.delete(id);
    }
    for (const c of map.values()) out.push(c);
    return out;
  }, [courses, order]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.teacherName.toLowerCase().includes(q) ||
        (c.category ?? "").toLowerCase().includes(q),
    );
  }, [sorted, search]);

  const groups = useMemo(() => groupCourses(filtered), [filtered]);

  function toggleGroup(key: CourseGroupKey) {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function onDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const ids = sorted.map((c) => c.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(from, 1);
    ids.splice(to, 0, dragId);
    setOrder(ids);
    saveCourseOrder(userId, ids);
    setDragId(null);
  }

  return (
    <section className="dash-panel">
      <div
        className="spread"
        style={{ marginBottom: 12, flexWrap: "wrap", gap: 8, alignItems: "center" }}
      >
        <h2 style={{ margin: 0, fontSize: 18 }}>我的课程</h2>
        <div className="row" style={{ flexWrap: "wrap" }}>
          <span className="muted">{semesterLabel}</span>
          <input
            placeholder="搜索课程…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              minWidth: 180,
            }}
          />
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="muted" style={{ padding: 24, textAlign: "center" }}>
          {courses.length === 0 ? (
            user?.role === "TEACHER" || user?.role === "ADMIN" ? (
              <Link to="/teaching">教学台</Link>
            ) : (
              <Link to="/enrollment">选课系统</Link>
            )
          ) : (
            "没有匹配的课程"
          )}
        </div>
      ) : (
        groups.map(({ key, courses: list }) => {
          const meta = COURSE_GROUP_META[key];
          const isCollapsed = collapsed[key];
          return (
            <div key={key} style={{ marginBottom: 16 }}>
              <button type="button" className="course-group-toggle" onClick={() => toggleGroup(key)}>
                <span>{isCollapsed ? "▸" : "▾"}</span>
                <span style={{ fontWeight: 700 }}>{meta.label}</span>
                <span className="muted" style={{ fontWeight: 400 }}>
                  {meta.hint} · {list.length} 门
                </span>
              </button>
              {!isCollapsed ? (
                <div className="course-card-grid">
                  {list.map((c) => (
                    <CourseCard
                      key={c.id}
                      course={c}
                      onDragStart={() => setDragId(c.id)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => onDrop(c.id)}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          );
        })
      )}

    </section>
  );
}

function CourseCard({
  course,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  course: DashboardCourse;
  onDragStart: () => void;
  onDragOver: (e: DragEvent) => void;
  onDrop: () => void;
}) {
  const todo = course.pendingHomework + course.pendingLabs;
  const unreadAnn = course.announcementCount ?? 0;
  return (
    <div
      className="course-dash-card"
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="spread" style={{ alignItems: "flex-start" }}>
        <div>
          <div>{course.title}</div>
          <div className="muted" style={{ marginTop: 4 }}>
            {course.teacherName}
            {course.category ? ` · ${course.category}` : ""}
          </div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          {unreadAnn > 0 ? <span className="badge-warn">{unreadAnn} 未读公告</span> : null}
          {todo > 0 ? <span className="badge-warn">{todo} 待办</span> : null}
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <div className="spread muted" style={{ fontSize: 12, marginBottom: 4 }}>
          <span>学习进度</span>
          <span>{course.progressPercent}%</span>
        </div>
        <div className="progress-bar">
          <div className="progress-bar-fill" style={{ width: `${course.progressPercent}%` }} />
        </div>
      </div>

      <Link
        className="btn primary"
        to={`/courses/${course.id}/announcements`}
        style={{ marginTop: 12, display: "block", textAlign: "center" }}
      >
        进入课程
      </Link>
    </div>
  );
}
