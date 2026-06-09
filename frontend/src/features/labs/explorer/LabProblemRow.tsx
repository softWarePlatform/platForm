import { Link } from "react-router-dom";
import type { LabGridTone, LabProblemGridStatus } from "./labExplorerStatus";
import { labProblemStatusLabel } from "./labExplorerStatus";

type Props = {
  to: string;
  tone: LabGridTone;
  status: LabProblemGridStatus;
  title: string;
  language: string;
  score?: string;
};

export default function LabProblemRow({ to, tone, status, title, language, score }: Props) {
  const label = labProblemStatusLabel(status);

  return (
    <Link to={to} className={`lab-problem-row lab-problem-row--${tone} lab-pressable`}>
      <span className={`lab-problem-row__badge lab-problem-row__badge--${tone}`}>{label}</span>
      <div className="lab-problem-row__body">
        <span className="lab-problem-row__title">{title}</span>
        <span className="lab-problem-row__lang">{language}</span>
      </div>
      <div className="lab-problem-row__side">
        {score != null ? <span className="lab-problem-row__score">{score}</span> : null}
        <span className="lab-problem-row__chevron" aria-hidden>
          ›
        </span>
      </div>
    </Link>
  );
}
