import { Link } from "react-router-dom";
import { formatDateTime, labSetTimeBannerStyle } from "../labs/labSetAccess";
import type { StudentLabSetOverviewCard, TeacherLabSetOverviewCard } from "../labs/labSetTypes";
import { LabCoverArt } from "./teachingVisuals";

type Props = {
  item: StudentLabSetOverviewCard | TeacherLabSetOverviewCard;
  mode: "student" | "teacher";
  showCourseName: boolean;
  onDelete?: (
    courseId: string,
    labSetId: string,
    title: string,
    problemCount: number,
  ) => void | Promise<void>;
};

export default function TeachingLabSetCard({ item, mode, showCourseName, onDelete }: Props) {
  const access = item.access;
  const statusStyle = labSetTimeBannerStyle(access);
  const isStudent = mode === "student";
  const teacherItem = !isStudent ? (item as TeacherLabSetOverviewCard) : null;

  const chips = [
    `${item.problemCount} 题`,
    item.dueAt ? `截止 ${formatDateTime(item.dueAt)}` : "无截止",
  ];
  if (teacherItem) {
    chips.push(`完成 ${teacherItem.completion.solved}/${teacherItem.completion.enrolled}`);
  }

  return (
    <article className="teach-lab-card">
      <LabCoverArt title={item.title} courseTitle={item.courseTitle} />
      <div className="teach-lab-card__body">
        <div className="teach-lab-card__head">
          <div>
            <h3 className="teach-lab-card__title">{item.title}</h3>
            {showCourseName ? <p className="teach-lab-card__course">{item.courseTitle}</p> : null}
          </div>
          <span className="status-badge status-badge--brand" style={statusStyle}>
            {access.statusLabel}
          </span>
        </div>
        <div className="teach-lab-card__chips">
          {chips.map((chip) => (
            <span key={chip} className="teach-lab-chip">
              {chip}
            </span>
          ))}
        </div>
        <div className="teach-lab-card__actions">
          <Link className="btn primary btn--sm" to={`/courses/${item.courseId}/labs/sets/${item.id}`}>
            {isStudent ? "进入" : "查看"}
          </Link>
          {!isStudent ? (
            <>
              <Link className="btn btn--sm" to={`/courses/${item.courseId}/lab-sets/${item.id}/manage`}>
                管理
              </Link>
              {onDelete ? (
                <button
                  type="button"
                  className="btn btn--sm btn--danger"
                  onClick={() => void onDelete(item.courseId, item.id, item.title, item.problemCount)}
                >
                  删除
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </article>
  );
}
