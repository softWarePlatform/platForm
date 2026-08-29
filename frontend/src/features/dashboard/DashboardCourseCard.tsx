import { Link } from "react-router-dom";
import type { DashboardCourse } from "./types";
import { CourseCoverArt, pickCourseTheme, themeStyle } from "./courseVisuals";
import { useAuth } from "../../auth/AuthContext";
import { coursePathForRole } from "../../lib/coursePaths";

type Props = {
  course: DashboardCourse;
};

export default function DashboardCourseCard({ course }: Props) {
  const { user } = useAuth();
  const theme = pickCourseTheme(course.title, course.category);
  const accent = themeStyle(theme).accent;
  const todo = course.pendingHomework + course.pendingLabs;

  return (
    <Link to={coursePathForRole(course.id, "announcements", user?.role)} className="dash-course-card">
      <CourseCoverArt title={course.title} category={course.category} theme={theme} />
      <div className="dash-course-card__body">
        <h3 className="dash-course-card__title">{course.title}</h3>
        <p className="dash-course-card__teacher">{course.teacherName}</p>
        <div className="dash-course-card__progress-head">
          <span>进度</span>
          <span>{course.progressPercent}%</span>
        </div>
        <div className="dash-course-card__bar">
          <div
            className="dash-course-card__bar-fill"
            style={{ width: `${course.progressPercent}%`, background: accent }}
          />
        </div>
        {todo > 0 || (course.announcementCount ?? 0) > 0 ? (
          <div className="dash-course-card__tags">
            {todo > 0 ? <span className="dash-course-card__tag">{todo} 待办</span> : null}
            {(course.announcementCount ?? 0) > 0 ? (
              <span className="dash-course-card__tag dash-course-card__tag--warn">
                {course.announcementCount} 公告
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </Link>
  );
}
