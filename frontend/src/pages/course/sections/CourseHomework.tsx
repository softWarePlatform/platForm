import { Link } from "react-router-dom";
import HomeworkPublishForm from "../../../components/homework/HomeworkPublishForm";
import EmptyState from "../../../components/layout/EmptyState";
import StatusBadge from "../../../components/layout/StatusBadge";
import { coursePathForRole } from "../../../lib/coursePaths";
import { useCourse } from "../CourseContext";
import CourseSectionHead from "../CourseSectionHead";

function homeworkChips(h: any, isTeacher: boolean) {
  return [
    h.dueAt ? `截止 ${new Date(h.dueAt).toLocaleDateString()}` : "无截止时间",
    h.targetClass?.name ? `班级 ${h.targetClass.name}` : h.targetClassName ? `班级 ${h.targetClassName}` : "全课可见",
    isTeacher && h.submissionCount != null ? `提交 ${h.submissionCount}` : null,
    isTeacher && h.gradedCount != null ? `批改 ${h.gradedCount}` : null,
    isTeacher && h.releasedCount != null ? `发布 ${h.releasedCount}` : null,
  ].filter(Boolean) as string[];
}

export default function CourseHomework() {
  const { courseId, isTeacher, user, err, displayHomework, setErr, refreshSideData } = useCourse();
  const rows = displayHomework as any[];

  return (
    <div className={isTeacher ? "homework-workspace homework-workspace--teacher" : "homework-workspace homework-workspace--student"}>
      <CourseSectionHead title={isTeacher ? "作业管理" : "课程作业"} />

      {err ? <div className="page-alert err">{err}</div> : null}

      {isTeacher ? (
        <section className="teacher-homework-publisher">
          <div className="teacher-homework-publisher__head">
            <div>
              <span className="teacher-homework-publisher__eyebrow">发布中心</span>
              <h3>布置新作业</h3>
              <p>填写要求、截止时间、附件和评分标准后，可以发布给全课或指定班级。</p>
            </div>
          </div>
          <div className="teacher-homework-publisher__body">
            <HomeworkPublishForm courseId={courseId} onCreated={refreshSideData} setErr={setErr} />
          </div>
        </section>
      ) : null}

      {rows.length > 0 ? (
        <div className="homework-list-head">
          <div>
            <h3 className="inline-section-title">{isTeacher ? "已布置作业" : "待查看作业"}</h3>
            <p>共 {rows.length} 项，点击卡片进入详情。</p>
          </div>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState title="暂无作业" />
      ) : (
        <div className="homework-card-grid">
          {rows.map((h) => (
            <Link
              key={h.id}
              className="homework-card entity-card--link"
              to={coursePathForRole(courseId, `homework/${h.id}`, user?.role)}
            >
              <div className="homework-card__head">
                <div className="homework-card__icon">{isTeacher ? "布" : "作"}</div>
                <div className="homework-card__main">
                  <h3 className="homework-card__title">{h.title}</h3>
                  <div className="homework-card__course">{isTeacher ? "进入批改与发布" : "查看要求与提交记录"}</div>
                </div>
                <StatusBadge tone={h.published !== false ? "ok" : "muted"}>
                  {h.published !== false ? "已发布" : "草稿"}
                </StatusBadge>
              </div>
              <div className="homework-card__chips">
                {homeworkChips(h, isTeacher).map((chip) => (
                  <span key={chip}>{chip}</span>
                ))}
              </div>
              <div className="homework-card__foot">
                <span>{isTeacher ? "批改作业" : "进入作业"}</span>
                <span aria-hidden>→</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
