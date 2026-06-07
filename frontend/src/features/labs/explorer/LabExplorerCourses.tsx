import { Link } from "react-router-dom";
import { useLabSetOverview } from "../useLabSetOverview";
import type { LabSetOverviewGroup, StudentLabSetOverviewCard } from "../labSetTypes";
import EmptyState from "../../../components/layout/EmptyState";
import { CourseCardGridSkeleton } from "../../../components/layout/PageSkeleton";
import PageHeader from "../../../components/layout/PageHeader";
import { groupSetsByCourse } from "./labExplorerStatus";

export default function LabExplorerCourses() {
  const { data, err, loading, reload } = useLabSetOverview("student");
  const groups = (data?.groups as LabSetOverviewGroup<StudentLabSetOverviewCard>[] | undefined) ?? [];
  const courses = groupSetsByCourse(groups);

  return (
    <>
      <PageHeader
        title="我的实验"
        lead={`${courses.length} 门课程`}
        actions={
          <button type="button" className="btn" onClick={() => void reload()}>
            刷新
          </button>
        }
      />

      {err ? <div className="page-alert err">{err}</div> : null}
      {loading ? <CourseCardGridSkeleton count={3} /> : null}

      {!loading && courses.length === 0 ? (
        <EmptyState title="暂无实验">
          <Link to="/enrollment">去选课</Link>
        </EmptyState>
      ) : null}

      {!loading && courses.length > 0 ? (
        <div className="lab-assign-stack">
          <div className="lab-course-grid">
            {courses.map((course) => {
              const completed = course.sets.filter((s) => s.completed).length;
              const total = course.sets.length;
              const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
              return (
                <Link key={course.courseId} className="lab-course-card lab-pressable" to={`/my-labs/${course.courseId}`}>
                  <div className="lab-course-card__title">{course.courseTitle}</div>
                  <div className="lab-course-card__sub">
                    {total} 个实验集 · 已完成 {completed}/{total}
                  </div>
                  {total > 0 ? (
                    <div className="lab-course-card__progress">
                      <div className="lab-course-card__progress-head">
                        <span>进度</span>
                        <span>{pct}%</span>
                      </div>
                      <div className="progress-bar">
                        <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  ) : null}
                  <span className="lab-course-card__cta">进入课程实验 →</span>
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}
    </>
  );
}
