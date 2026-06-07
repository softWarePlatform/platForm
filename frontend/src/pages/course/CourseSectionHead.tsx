import type { ReactNode } from "react";

export default function CourseSectionHead({
  title,
  actions,
}: {
  title: string;
  actions?: ReactNode;
}) {
  return (
    <header className="course-section-head">
      <div className="course-section-head__row">
        <div>
          <h2>{title}</h2>
        </div>
        {actions ? <div className="course-section-head__actions">{actions}</div> : null}
      </div>
    </header>
  );
}
