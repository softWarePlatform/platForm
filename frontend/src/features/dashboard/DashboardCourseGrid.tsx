import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import type { DashboardCourse } from "./types";
import DashboardCourseCard from "./DashboardCourseCard";

type Props = {
  courses: DashboardCourse[];
  enrollmentLink?: string;
};

export default function DashboardCourseGrid({ courses, enrollmentLink = "/enrollment" }: Props) {
  const { user } = useAuth();
  const [search, setSearch] = useState("");

  const active = useMemo(() => {
    const list = courses.filter((c) => !c.isHistory);
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.teacherName.toLowerCase().includes(q) ||
        (c.category ?? "").toLowerCase().includes(q),
    );
  }, [courses, search]);

  return (
    <section className="dash-glass-panel dash-course-section">
      <div className="dash-section-head">
        <h2 className="dash-section-head__title">我的课程</h2>
        <div className="dash-section-head__actions">
          <input
            className="dash-search"
            placeholder="搜索课程…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {user?.role === "STUDENT" ? (
            <Link className="dash-link-more" to={enrollmentLink}>
              全部课程 →
            </Link>
          ) : (
            <Link className="dash-link-more" to="/teaching">
              教学台 →
            </Link>
          )}
        </div>
      </div>

      {active.length === 0 ? (
        <div className="dash-empty">
          {courses.length === 0 ? (
            <>
              <p>还没有课程</p>
              {user?.role === "STUDENT" ? (
                <Link className="btn primary" to={enrollmentLink}>
                  去选课
                </Link>
              ) : (
                <Link className="btn primary" to="/teaching">
                  创建课程
                </Link>
              )}
            </>
          ) : (
            <p className="muted">没有匹配的课程</p>
          )}
        </div>
      ) : (
        <div className="dash-course-grid">
          {active.map((c) => (
            <DashboardCourseCard key={c.id} course={c} />
          ))}
        </div>
      )}
    </section>
  );
}
