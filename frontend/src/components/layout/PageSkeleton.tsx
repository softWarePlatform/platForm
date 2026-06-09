import type { CSSProperties } from "react";

type BlockProps = {
  className?: string;
  style?: CSSProperties;
};

function Block({ className = "", style }: BlockProps) {
  return <div className={`skeleton-block ${className}`.trim()} style={style} aria-hidden />;
}

export function LabListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="lab-assign-stack skeleton-stack" aria-busy="true" aria-label="加载中">
      <div className="skeleton-stack__header">
        <Block style={{ width: "38%", height: 18 }} />
      </div>
      <div className="lab-assign-list">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="skeleton-lab-row">
            <Block className="skeleton-lab-row__mark" />
            <div className="skeleton-lab-row__body">
              <Block style={{ width: "52%", height: 16, marginBottom: 10 }} />
              <Block style={{ width: "36%", height: 12 }} />
            </div>
            <Block className="skeleton-lab-row__score" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function CourseHeroSkeleton() {
  return (
    <div className="course-page" aria-busy="true" aria-label="加载课程">
      <div className="course-hero course-hero--skeleton">
        <div className="container course-hero__inner">
          <Block style={{ width: 80, height: 14, marginBottom: 16 }} />
          <Block style={{ width: "min(420px, 70%)", height: 28, marginBottom: 12 }} />
          <Block style={{ width: "min(280px, 50%)", height: 14 }} />
        </div>
      </div>
      <div className="container course-body">
        <div className="skeleton-tabs">
          {Array.from({ length: 5 }, (_, i) => (
            <Block key={i} style={{ width: 64, height: 32 }} />
          ))}
        </div>
        <div className="skeleton-panel" style={{ marginTop: 20 }}>
          <Block style={{ width: "40%", height: 18, marginBottom: 16 }} />
          <Block style={{ width: "100%", height: 12, marginBottom: 10 }} />
          <Block style={{ width: "92%", height: 12, marginBottom: 10 }} />
          <Block style={{ width: "78%", height: 12 }} />
        </div>
      </div>
    </div>
  );
}

export function FormSkeleton() {
  return (
    <div className="skeleton-panel" aria-busy="true" aria-label="加载表单">
      <Block style={{ width: "45%", height: 20, marginBottom: 20 }} />
      <Block style={{ width: "100%", height: 120, marginBottom: 16 }} />
      <Block style={{ width: 96, height: 36 }} />
    </div>
  );
}

export function CourseCardGridSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="lab-assign-stack skeleton-stack" aria-busy="true" aria-label="加载中">
      <div className="lab-course-grid">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="skeleton-course-card">
            <Block style={{ width: "70%", height: 18, marginBottom: 10 }} />
            <Block style={{ width: "50%", height: 12, marginBottom: 16 }} />
            <Block style={{ width: "100%", height: 6, marginBottom: 16 }} />
            <Block style={{ width: "100%", height: 36 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
