import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  narrow?: boolean;
};

export default function PageShell({ children, className = "", narrow = false }: Props) {
  return (
    <div className={`page-shell${narrow ? " page-shell--narrow" : ""} ${className}`.trim()}>
      <div className="container page-shell__inner">{children}</div>
    </div>
  );
}
