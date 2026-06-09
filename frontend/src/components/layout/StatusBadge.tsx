import type { ReactNode } from "react";

type Tone = "ok" | "muted" | "warn" | "brand";

export default function StatusBadge({ children, tone = "muted" }: { children: ReactNode; tone?: Tone }) {
  return <span className={`status-badge status-badge--${tone}`}>{children}</span>;
}
