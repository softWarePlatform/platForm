import type { ReactNode } from "react";

type Props = {
  title: string;
  lead?: string;
  actions?: ReactNode;
  below?: ReactNode;
};

export default function PageHeader({ title, lead, actions, below }: Props) {
  return (
    <header className="page-header">
      <div className="page-header__row">
        <div className="page-header__text">
          <h1 className="page-title">{title}</h1>
          {lead ? <p className="page-lead">{lead}</p> : null}
        </div>
        {actions ? <div className="page-header__actions">{actions}</div> : null}
      </div>
      {below}
    </header>
  );
}
