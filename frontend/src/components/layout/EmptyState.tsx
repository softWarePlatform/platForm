import type { ReactNode } from "react";

type Props = {
  title?: string;
  children?: ReactNode;
};

export default function EmptyState({ title = "暂无内容", children }: Props) {
  return (
    <div className="empty-state">
      <div className="empty-state__title">{title}</div>
      {children ? <div className="empty-state__body">{children}</div> : null}
    </div>
  );
}
