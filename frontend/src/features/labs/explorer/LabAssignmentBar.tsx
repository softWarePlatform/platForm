import { Link } from "react-router-dom";
import type { LabGridTone } from "./labExplorerStatus";
import { labSetStatusLabel } from "./labExplorerStatus";

type Props = {
  to: string;
  tone: Exclude<LabGridTone, "red">;
  title: string;
  dateRange: string;
  score: string;
  done: number;
  total: number;
  accessLabel?: string;
};

const MARK_LABEL: Record<Exclude<LabGridTone, "red">, string> = {
  gray: "待",
  yellow: "进",
  green: "✓",
};

export default function LabAssignmentBar({
  to,
  tone,
  title,
  dateRange,
  score,
  done,
  total,
  accessLabel,
}: Props) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const hasScore = score !== "—";

  return (
    <Link
      to={to}
      className={`lab-assign-bar lab-assign-bar--${tone} lab-pressable`}
    >
      <span className={`lab-assign-bar__mark lab-assign-bar__mark--${tone}`} aria-hidden>
        {MARK_LABEL[tone]}
      </span>
      <div className="lab-assign-bar__main">
        <div className="lab-assign-bar__title-row">
          <span className="lab-assign-bar__title">{title}</span>
          <span className={`lab-status-pill lab-status-pill--${tone}`}>{labSetStatusLabel(tone)}</span>
        </div>
        <div className="lab-assign-bar__meta">
          <span>{dateRange}</span>
          <span className="lab-assign-bar__dot" aria-hidden>
            ·
          </span>
          <span>
            {done}/{total} 题
          </span>
          {tone === "yellow" && total > 0 ? (
            <>
              <span className="lab-assign-bar__dot" aria-hidden>
                ·
              </span>
              <span>{pct}%</span>
            </>
          ) : null}
          {accessLabel ? (
            <>
              <span className="lab-assign-bar__dot" aria-hidden>
                ·
              </span>
              <span>{accessLabel}</span>
            </>
          ) : null}
        </div>
        {tone === "yellow" && total > 0 ? (
          <div className="lab-assign-bar__progress" aria-hidden>
            <div className="lab-assign-bar__progress-fill" style={{ width: `${pct}%` }} />
          </div>
        ) : null}
      </div>
      <div className="lab-assign-bar__side">
        <div className="lab-assign-bar__score-badge">
          <span className="lab-assign-bar__score">{score}</span>
          {hasScore ? <span className="lab-assign-bar__score-label">分</span> : null}
        </div>
        <span className="lab-assign-bar__chevron" aria-hidden>
          ›
        </span>
      </div>
    </Link>
  );
}
