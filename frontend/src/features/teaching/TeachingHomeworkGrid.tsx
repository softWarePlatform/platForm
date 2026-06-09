import { Link } from "react-router-dom";
import EmptyState from "../../components/layout/EmptyState";
import StatusBadge from "../../components/layout/StatusBadge";
import { HomeworkCoverArt } from "./teachingVisuals";

export type HomeworkRow = {
  id: string;
  title: string;
  courseId: string;
  courseTitle: string;
  dueAt: string | null;
  published: boolean;
  targetClassName: string | null;
  submissionCount: number;
  gradedCount: number;
  releasedCount: number;
};

export default function TeachingHomeworkGrid({ rows }: { rows: HomeworkRow[] }) {
  if (rows.length === 0) {
    return <EmptyState title="暂无作业" />;
  }

  return (
    <div className="teach-homework-grid">
      {rows.map((r) => {
        const pending = Math.max(0, r.submissionCount - r.gradedCount);
        return (
          <article key={r.id} className="teach-homework-card">
            <HomeworkCoverArt title={r.title} />
            <div className="teach-homework-card__body">
              <p className="teach-homework-card__course">{r.courseTitle}</p>
              <h3 className="teach-homework-card__title">{r.title}</h3>
              {r.targetClassName ? (
                <p className="teach-homework-card__class">{r.targetClassName}</p>
              ) : null}
              <div className="teach-homework-card__meta">
                <StatusBadge tone={r.published ? "ok" : "muted"}>
                  {r.published ? "已发布" : "草稿"}
                </StatusBadge>
                <span className="teach-homework-card__due">
                  {r.dueAt ? `截止 ${new Date(r.dueAt).toLocaleDateString()}` : "无截止"}
                </span>
              </div>
              <div className="teach-homework-card__stats">
                <div className="teach-mini-stat teach-mini-stat--blue">
                  <strong>{r.submissionCount}</strong>
                  <span>提交</span>
                </div>
                <div className="teach-mini-stat teach-mini-stat--purple">
                  <strong>{r.gradedCount}</strong>
                  <span>批改</span>
                </div>
                <div className="teach-mini-stat teach-mini-stat--teal">
                  <strong>{r.releasedCount}</strong>
                  <span>发布</span>
                </div>
                {pending > 0 ? (
                  <div className="teach-mini-stat teach-mini-stat--amber">
                    <strong>{pending}</strong>
                    <span>待批</span>
                  </div>
                ) : null}
              </div>
              <Link className="btn primary btn--sm teach-homework-card__cta" to={`/courses/${r.courseId}/homework/${r.id}`}>
                去批改
              </Link>
            </div>
          </article>
        );
      })}
    </div>
  );
}
