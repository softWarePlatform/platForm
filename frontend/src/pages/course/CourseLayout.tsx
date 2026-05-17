import { Link, NavLink, Outlet } from "react-router-dom";
import { CourseProvider, useCourse } from "./CourseContext";
import { courseModulesForNav } from "../../modules/courseNav";

function CourseLayoutInner() {
  const { course, err, user, courseId, enroll, isTeacher } = useCourse();
  const modules = courseModulesForNav();

  if (!course && !err) {
    return (
      <div className="course-page">
        <div className="container course-page__loading muted">加载课程…</div>
      </div>
    );
  }

  if (err && !course) {
    return (
      <div className="container" style={{ paddingTop: 32 }}>
        <div className="err">{err}</div>
        <Link className="btn" to="/" style={{ marginTop: 16 }}>
          返回主界面
        </Link>
      </div>
    );
  }

  const showEnroll =
    (user?.role === "STUDENT" || user?.role === "ADMIN") && !isTeacher;

  return (
    <div className="course-page">
      <div className="course-hero">
        <div className="container course-hero__inner">
          <Link to="/" className="course-back">
            ← 主界面
          </Link>
          <div className="course-hero__main">
            <div className="course-hero__text">
              <h1 className="course-hero__title">{course.title}</h1>
              <p className="course-hero__meta">
                <span className="course-hero__teacher">{course.teacher?.name ?? "任课教师"}</span>
                {course.category ? <span className="course-hero__dot">·</span> : null}
                {course.category ? <span>{course.category}</span> : null}
                {course.published ? (
                  <span className="course-hero__badge">已发布</span>
                ) : (
                  <span className="course-hero__badge course-hero__badge--draft">未发布</span>
                )}
              </p>
            </div>
            <div className="course-hero__actions">
              {showEnroll ? (
                <button className="btn course-hero__btn" type="button" onClick={enroll}>
                  选课
                </button>
              ) : null}
              {isTeacher ? (
                <Link className="btn course-hero__btn course-hero__btn--ghost" to={`/courses/${courseId}/manage`}>
                  课程设置
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="container course-body">
        <nav className="course-tabs" aria-label="课程模块">
          {modules.map((m) => (
            <NavLink
              key={m.id}
              to={m.segment}
              className={({ isActive }) =>
                `course-tab${isActive ? " course-tab--active" : ""}${m.status === "planned" ? " course-tab--planned" : ""}`
              }
            >
              {m.label}
            </NavLink>
          ))}
        </nav>

        {err ? <div className="err course-body__err">{err}</div> : null}

        <main className="course-panel">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default function CourseLayout() {
  return (
    <CourseProvider>
      <CourseLayoutInner />
    </CourseProvider>
  );
}
