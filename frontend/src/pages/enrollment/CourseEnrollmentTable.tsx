import { useState } from "react";
import type { CatalogCourse } from "./enrollmentTypes";

type Props = {
  courses: CatalogCourse[];
  loading?: boolean;
  open: boolean;
  busyId: string | null;
  emptyText?: string;
  showRecommendBadge?: boolean;
  onEnroll: (courseId: string, classId?: string) => void;
  onDrop: (courseId: string) => void;
  onWaitlist: (courseId: string) => void;
  onLeaveWaitlist: (courseId: string) => void;
};

export default function CourseEnrollmentTable({
  courses,
  loading,
  open,
  busyId,
  emptyText = "\u6682\u65e0\u8bfe\u7a0b",
  showRecommendBadge,
  onEnroll,
  onDrop,
  onWaitlist,
  onLeaveWaitlist,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading) {
    return <div className="enroll-empty">{"\u52a0\u8f7d\u4e2d\u2026"}</div>;
  }

  if (!courses.length) {
    return <div className="enroll-empty">{emptyText}</div>;
  }

  return (
    <div className="enroll-table-wrap">
      <table className="enroll-course-table">
        <thead>
          <tr>
            <th style={{ width: 36 }} />
            <th>{"\u8bfe\u7a0b\u4ee3\u7801"}</th>
            <th>{"\u8bfe\u7a0b\u540d"}</th>
            <th style={{ width: 88 }}>{"\u5df2\u9009\u73ed\u6570"}</th>
            <th>{"\u8bfe\u7a0b\u7c7b\u522b"}</th>
            <th style={{ width: 56 }}>{"\u5b66\u5206"}</th>
          </tr>
        </thead>
        <tbody>
          {courses.map((c) => {
            const isOpen = expanded.has(c.id);
            const busy = busyId === c.id;
            return (
              <CourseBlock
                key={c.id}
                course={c}
                isOpen={isOpen}
                busy={busy}
                enrollOpen={open}
                showRecommendBadge={showRecommendBadge}
                onToggle={() => toggle(c.id)}
                onEnroll={onEnroll}
                onDrop={onDrop}
                onWaitlist={onWaitlist}
                onLeaveWaitlist={onLeaveWaitlist}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CourseBlock({
  course: c,
  isOpen,
  busy,
  enrollOpen,
  showRecommendBadge,
  onToggle,
  onEnroll,
  onDrop,
  onWaitlist,
  onLeaveWaitlist,
}: {
  course: CatalogCourse;
  isOpen: boolean;
  busy: boolean;
  enrollOpen: boolean;
  showRecommendBadge?: boolean;
  onToggle: () => void;
  onEnroll: (courseId: string, classId?: string) => void;
  onDrop: (courseId: string) => void;
  onWaitlist: (courseId: string) => void;
  onLeaveWaitlist: (courseId: string) => void;
}) {
  const categoryLabel = c.subjectCategoryLabel || c.category || "\u2014";

  return (
    <>
      <tr
        className={`enroll-course-row${isOpen ? " expanded" : ""}`}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        tabIndex={0}
        role="button"
        aria-expanded={isOpen}
      >
        <td>
          <span className="enroll-expand-icon">{isOpen ? "\u25bc" : "\u25b6"}</span>
        </td>
        <td>
          <strong>{c.courseCode ?? "\u2014"}</strong>
          {showRecommendBadge && c.recommendReason ? (
            <span className="enroll-tag info">{c.recommendReason}</span>
          ) : null}
          {c.scheduleConflict && !c.isEnrolled ? (
            <span className="enroll-tag warn">{"\u65f6\u95f4\u51b2\u7a81"}</span>
          ) : null}
        </td>
        <td>{c.title}</td>
        <td style={{ textAlign: "center" }}>{c.selectedSectionCount || (c.isEnrolled ? 1 : 0)}</td>
        <td>{categoryLabel}</td>
        <td style={{ textAlign: "center" }}>{c.credits}</td>
      </tr>
      {isOpen ? (
        <tr>
          <td colSpan={6} className="enroll-section-wrap" style={{ padding: 0 }}>
            <table className="enroll-section-table">
              <thead>
                <tr>
                  <th>{"\u6559\u5e08\u540d\u79f0"}</th>
                  <th style={{ width: 72 }}>{"\u8bfe\u7a0b\u6027\u8d28"}</th>
                  <th style={{ width: 100 }}>{"\u8bfe\u7a0b\u7c7b\u522b"}</th>
                  <th>{"\u5f00\u8bfe\u5355\u4f4d"}</th>
                  <th>{"\u4e0a\u8bfe\u65f6\u95f4\u5730\u70b9"}</th>
                  <th style={{ width: 64 }}>{"\u8bfe\u5bb9\u91cf"}</th>
                  <th style={{ width: 72 }}>{"\u5df2\u9009\u4eba\u6570"}</th>
                  <th style={{ width: 72 }}>{"\u51b2\u7a81"}</th>
                  <th style={{ width: 88 }}>{"\u64cd\u4f5c"}</th>
                </tr>
              </thead>
              <tbody>
                {c.sections.map((sec) => (
                  <tr key={sec.sectionId} onClick={(e) => e.stopPropagation()}>
                    <td>{sec.sectionLabel}</td>
                    <td>{sec.courseNatureLabel}</td>
                    <td>{sec.subjectCategoryLabel}</td>
                    <td>{sec.department}</td>
                    <td style={{ lineHeight: 1.45 }}>{sec.scheduleDetail}</td>
                    <td>{sec.capacity}</td>
                    <td>
                      {sec.enrolledCount}
                      {"\u4eba"}
                    </td>
                    <td>
                      {sec.scheduleConflict && !sec.isSelected ? (
                        <span className="enroll-tag warn">{"\u51b2\u7a81"}</span>
                      ) : (
                        <span className="enroll-tag ok">{"\u4e0d\u51b2\u7a81"}</span>
                      )}
                    </td>
                    <td>
                      <SectionActions
                        course={c}
                        section={sec}
                        busy={busy}
                        open={enrollOpen}
                        onEnroll={onEnroll}
                        onDrop={onDrop}
                        onWaitlist={onWaitlist}
                        onLeaveWaitlist={onLeaveWaitlist}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function SectionActions({
  course: c,
  section: sec,
  busy,
  open,
  onEnroll,
  onDrop,
  onWaitlist,
  onLeaveWaitlist,
}: {
  course: CatalogCourse;
  section: CatalogCourse["sections"][number];
  busy: boolean;
  open: boolean;
  onEnroll: (courseId: string, classId?: string) => void;
  onDrop: (courseId: string) => void;
  onWaitlist: (courseId: string) => void;
  onLeaveWaitlist: (courseId: string) => void;
}) {
  const classId = sec.sectionId !== c.id ? sec.sectionId : undefined;

  if (sec.isSelected || c.isEnrolled) {
    return (
      <button
        type="button"
        className="enroll-link-btn"
        disabled={busy || !open}
        onClick={() => onDrop(c.id)}
      >
        {"\u9000\u9009"}
      </button>
    );
  }

  if (sec.isFull || c.isFull) {
    if (c.isWaitlisted) {
      return (
        <button
          type="button"
          className="enroll-link-btn"
          disabled={busy || !open}
          onClick={() => onLeaveWaitlist(c.id)}
        >
          {"\u53d6\u6d88\u5019\u8865"}
        </button>
      );
    }
    return (
      <button
        type="button"
        className="enroll-link-btn"
        disabled={busy || !open}
        onClick={() => onWaitlist(c.id)}
      >
        {"\u5019\u8865"}
      </button>
    );
  }

  return (
    <button
      type="button"
      className="enroll-link-btn"
      disabled={busy || !open || (sec.scheduleConflict && !c.isEnrolled)}
      title={sec.scheduleConflict ? "\u4e0e\u5df2\u9009\u8bfe\u8868\u51b2\u7a81" : undefined}
      onClick={() => {
        if (!globalThis.confirm("\u786e\u8ba4\u9009\u8bfe\uff1f")) return;
        onEnroll(c.id, classId);
      }}
    >
      {"\u9009\u8bfe"}
    </button>
  );
}
