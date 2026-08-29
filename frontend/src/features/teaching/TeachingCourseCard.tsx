import { Link } from "react-router-dom";
import { CourseCoverArt, pickCourseTheme, themeStyle } from "../dashboard/courseVisuals";
import StatusBadge from "../../components/layout/StatusBadge";
import { formatScheduleSummary } from "../../components/CourseScheduleFields";
import { courseManagePathForRole, coursePathForRole } from "../../lib/coursePaths";

type Props = {
  id: string;
  title: string;
  courseCode?: string | null;
  category?: string | null;
  published: boolean;
  capacity?: number | null;
  enrollments?: number;
  labs?: number;
  homeworks?: number;
  scheduleSlots?: Array<{ dayOfWeek: number; periodStart: number; periodEnd: number; room: string }>;
};

export default function TeachingCourseCard({
  id,
  title,
  courseCode,
  category,
  published,
  capacity,
  enrollments = 0,
  labs = 0,
  homeworks = 0,
  scheduleSlots,
}: Props) {
  const theme = pickCourseTheme(title, category ?? null);
  const accent = themeStyle(theme).accent;
  const activity = homeworks + labs;
  const activityPct = activity > 0 ? Math.min(100, Math.round((homeworks / activity) * 50 + (labs / activity) * 50)) : 0;

  return (
    <article className="teach-course-card">
      <CourseCoverArt title={title} category={category ?? null} theme={theme} />
      <div className="teach-course-card__body">
        <div className="teach-course-card__head">
          <h3 className="teach-course-card__title">
            {courseCode ? <span className="teach-course-card__code">{courseCode}</span> : null}
            {title}
          </h3>
          <StatusBadge tone={published ? "ok" : "muted"}>{published ? "已发布" : "草稿"}</StatusBadge>
        </div>
        <p className="teach-course-card__meta">
          选课 {enrollments}
          {capacity != null ? ` / ${capacity}` : ""}
          {" · "}
          实验 {labs} · 作业 {homeworks}
        </p>
        {scheduleSlots?.length ? (
          <p className="teach-course-card__schedule">{formatScheduleSummary(scheduleSlots)}</p>
        ) : null}
        <div className="teach-course-card__progress-head">
          <span>教学负载</span>
          <span>{activity} 项</span>
        </div>
        <div className="dash-course-card__bar">
          <div
            className="dash-course-card__bar-fill"
            style={{ width: `${Math.max(activityPct, activity > 0 ? 12 : 0)}%`, background: accent }}
          />
        </div>
        <div className="teach-course-card__actions">
          <Link className="btn primary btn--sm" to={courseManagePathForRole(id, "TEACHER")}>
            管理
          </Link>
          <Link className="btn btn--sm" to={coursePathForRole(id, "announcements", "TEACHER")}>
            进入
          </Link>
        </div>
      </div>
    </article>
  );
}
