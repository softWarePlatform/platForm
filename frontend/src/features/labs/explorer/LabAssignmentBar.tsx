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
  const allAc = tone === "green";

  const bar = (
    <Link
      to={to}
      className={`lab-assign-bar lab-assign-bar--${tone}${allAc ? " lab-assign-bar--all-ac" : ""} lab-pressable`}
    >
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
          {accessLabel ? (
            <>
              <span className="lab-assign-bar__dot" aria-hidden>
                ·
              </span>
              <span>{accessLabel}</span>
            </>
          ) : null}
        </div>
        {total > 0 ? (
          <div className="lab-assign-bar__progress" aria-hidden>
            <div className="lab-assign-bar__progress-fill" style={{ width: `${pct}%` }} />
          </div>
        ) : null}
      </div>
      <div className="lab-assign-bar__side">
        <span className="lab-assign-bar__score">{score}</span>
        <span className="lab-assign-bar__chevron" aria-hidden>
          ›
        </span>
      </div>
    </Link>
  );

  if (allAc) {
    return <div className="lab-assign-bar-shimmer">{bar}</div>;
  }

  return bar;
}
