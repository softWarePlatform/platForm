import { Link } from "react-router-dom";
import { useLabSetOverview } from "../useLabSetOverview";
import type { LabSetOverviewGroup, StudentLabSetOverviewCard } from "../labSetTypes";
import LabExplorerBreadcrumb from "./LabExplorerBreadcrumb";
import { groupSetsByCourse } from "./labExplorerStatus";

export default function LabExplorerCourses() {
  const { data, err, loading, reload } = useLabSetOverview("student");
  const groups = (data?.groups as LabSetOverviewGroup<StudentLabSetOverviewCard>[] | undefined) ?? [];
  const courses = groupSetsByCourse(groups);

  return (
    <div className="lab-explorer">
      <div className="lab-explorer-panel">
        <div className="spread" style={{ alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h2 className="lab-explorer-title">我的实验</h2>
            <p className="lab-explorer-desc">先选择课程，再查看各次作业与题目完成情况。</p>
          </div>
          <button type="button" className="btn" onClick={() => void reload()}>
            刷新
          </button>
        </div>
        <LabExplorerBreadcrumb items={[{ label: "全部课程" }]} />
      </div>

      {err ? <div className="err" style={{ marginTop: 12 }}>{err}</div> : null}
      {loading ? <div className="muted lab-explorer-loading">加载中…</div> : null}

      {!loading && courses.length === 0 ? (
        <div className="course-section-empty lab-explorer-empty">
          暂无实验。请先在选课系统中加入课程，或等待教师发布实验。
        </div>
      ) : null}

      {!loading && courses.length > 0 ? (
        <div className="course-card-grid">
          {courses.map((course) => {
            const completed = course.sets.filter((s) => s.completed).length;
            const total = course.sets.length;
            const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
            return (
              <div key={course.courseId} className="course-dash-card">
                <div className="course-dash-card__title">{course.courseTitle}</div>
                <div className="muted course-dash-card__sub">
                  {total} 个实验集
                  {total > 0 ? ` · 已全部通过 ${completed}/${total}` : ""}
                </div>
                {total > 0 ? (
                  <div className="course-dash-card__progress">
                    <div className="spread muted" style={{ fontSize: 12, marginBottom: 4 }}>
                      <span>实验完成度</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                ) : null}
                <Link
                  className="btn primary lab-pressable"
                  to={`/my-labs/${course.courseId}`}
                  style={{ marginTop: 12, display: "block", textAlign: "center" }}
                >
                  进入实验
                </Link>
              </div>
            );
          })}
        </div>
      ) : null}

      <p className="muted lab-explorer-foot">
        也可在 <Link to="/enrollment">选课系统</Link> 选课，或进入各课程「实验管理」。
      </p>
    </div>
  );
}
