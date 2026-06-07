import { Link } from "react-router-dom";
import HomeworkPublishForm from "../../../components/homework/HomeworkPublishForm";
import EmptyState from "../../../components/layout/EmptyState";
import StatusBadge from "../../../components/layout/StatusBadge";
import { useCourse } from "../CourseContext";
import CourseSectionHead from "../CourseSectionHead";

export default function CourseHomework() {
  const { courseId, isTeacher, err, displayHomework, setErr, refreshSideData } = useCourse();

  return (
    <div>
      <CourseSectionHead title="作业" />

      {err ? <div className="page-alert err">{err}</div> : null}

      {isTeacher ? (
        <div className="form-sheet" style={{ marginBottom: 28 }}>
          <HomeworkPublishForm courseId={courseId} onCreated={refreshSideData} setErr={setErr} />
        </div>
      ) : null}

      {displayHomework.length > 0 ? (
        <h3 className="inline-section-title">已布置</h3>
      ) : null}

      {displayHomework.length === 0 ? (
        <EmptyState title="暂无作业" />
      ) : (
        <div className="entity-card-grid">
          {displayHomework.map((h: any) => (
            <Link
              key={h.id}
              className="entity-card entity-card--link"
              to={`/courses/${courseId}/homework/${h.id}`}
            >
              <div className="entity-card__head">
                <h3 className="entity-card__title">{h.title}</h3>
                <StatusBadge tone={h.published !== false ? "ok" : "muted"}>
                  {h.published !== false ? "已发布" : "草稿"}
                </StatusBadge>
              </div>
              <div className="entity-card__sub">
                {h.dueAt ? `截止 ${new Date(h.dueAt).toLocaleDateString()}` : "无截止"}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
