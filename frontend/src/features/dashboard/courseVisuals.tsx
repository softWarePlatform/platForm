import type { ReactNode } from "react";

export type CourseVisualTheme = "blue" | "teal" | "purple" | "indigo" | "amber" | "rose";

const THEME_STYLES: Record<
  CourseVisualTheme,
  { gradient: string; accent: string; orb: string }
> = {
  blue: {
    gradient: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 55%, #1e3a8a 100%)",
    accent: "#2563eb",
    orb: "rgba(147, 197, 253, 0.45)",
  },
  teal: {
    gradient: "linear-gradient(135deg, #2dd4bf 0%, #0d9488 50%, #0f766e 100%)",
    accent: "#0d9488",
    orb: "rgba(153, 246, 228, 0.5)",
  },
  purple: {
    gradient: "linear-gradient(135deg, #a78bfa 0%, #7c3aed 55%, #5b21b6 100%)",
    accent: "#7c3aed",
    orb: "rgba(216, 180, 254, 0.45)",
  },
  indigo: {
    gradient: "linear-gradient(135deg, #6366f1 0%, #4f46e5 50%, #3730a3 100%)",
    accent: "#4f46e5",
    orb: "rgba(199, 210, 254, 0.45)",
  },
  amber: {
    gradient: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 50%, #d97706 100%)",
    accent: "#d97706",
    orb: "rgba(253, 230, 138, 0.5)",
  },
  rose: {
    gradient: "linear-gradient(135deg, #fb7185 0%, #e11d48 55%, #be123c 100%)",
    accent: "#e11d48",
    orb: "rgba(254, 205, 211, 0.45)",
  },
};

export function pickCourseTheme(title: string, category: string | null): CourseVisualTheme {
  const blob = `${title} ${category ?? ""}`;
  if (/数据结构|算法|离散/.test(blob)) return "teal";
  if (/操作系统|体系结构|组成|网络|编译/.test(blob)) return "purple";
  if (/数据库|数据管理|SQL/i.test(blob)) return "indigo";
  if (/实验|实践|实训/.test(blob)) return "amber";
  if (/英语|思政|体育|通识/.test(blob)) return "rose";
  if (/程序|软件|编程|Java|Python|C\+\+/.test(blob)) return "blue";
  let h = 0;
  for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) >>> 0;
  const pool: CourseVisualTheme[] = ["blue", "teal", "purple", "indigo"];
  return pool[h % pool.length];
}

export function themeStyle(theme: CourseVisualTheme) {
  return THEME_STYLES[theme];
}

function ArtDatabase() {
  return (
    <svg viewBox="0 0 120 80" className="dash-cover-art__svg" aria-hidden>
      <ellipse cx="60" cy="22" rx="28" ry="10" fill="rgba(255,255,255,0.35)" />
      <path d="M32 22v36c0 5.5 12.5 10 28 10s28-4.5 28-10V22" fill="rgba(255,255,255,0.22)" />
      <ellipse cx="60" cy="40" rx="28" ry="10" fill="rgba(255,255,255,0.28)" />
      <ellipse cx="60" cy="58" rx="28" ry="10" fill="rgba(255,255,255,0.2)" />
    </svg>
  );
}

function ArtChip() {
  return (
    <svg viewBox="0 0 120 80" className="dash-cover-art__svg" aria-hidden>
      <rect x="34" y="24" width="52" height="40" rx="6" fill="rgba(255,255,255,0.25)" />
      <rect x="42" y="32" width="36" height="24" rx="3" fill="rgba(255,255,255,0.4)" />
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={28 + i * 20} y={18} width="4" height="8" rx="1" fill="rgba(255,255,255,0.5)" />
      ))}
      {[0, 1, 2, 3].map((i) => (
        <rect key={`b${i}`} x={28 + i * 20} y={62} width="4" height="8" rx="1" fill="rgba(255,255,255,0.5)" />
      ))}
    </svg>
  );
}

function ArtCode() {
  return (
    <svg viewBox="0 0 120 80" className="dash-cover-art__svg" aria-hidden>
      <rect x="28" y="20" width="64" height="44" rx="8" fill="rgba(255,255,255,0.22)" />
      <path d="M44 40 L36 48 L44 56" stroke="rgba(255,255,255,0.75)" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M76 40 L84 48 L76 56" stroke="rgba(255,255,255,0.75)" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M62 34 L54 54" stroke="rgba(255,255,255,0.55)" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function ArtGraph() {
  return (
    <svg viewBox="0 0 120 80" className="dash-cover-art__svg" aria-hidden>
      <circle cx="44" cy="52" r="8" fill="rgba(255,255,255,0.45)" />
      <circle cx="76" cy="36" r="8" fill="rgba(255,255,255,0.45)" />
      <circle cx="60" cy="24" r="8" fill="rgba(255,255,255,0.35)" />
      <line x1="44" y1="52" x2="76" y2="36" stroke="rgba(255,255,255,0.5)" strokeWidth="2" />
      <line x1="76" y1="36" x2="60" y2="24" stroke="rgba(255,255,255,0.5)" strokeWidth="2" />
      <line x1="60" y1="24" x2="44" y2="52" stroke="rgba(255,255,255,0.5)" strokeWidth="2" />
    </svg>
  );
}

export function CourseCoverArt({ title, category, theme }: { title: string; category: string | null; theme: CourseVisualTheme }) {
  const blob = `${title} ${category ?? ""}`;
  let art: ReactNode = <ArtCode />;
  if (/数据库|SQL/i.test(blob)) art = <ArtDatabase />;
  else if (/体系结构|组成|芯片|硬件/.test(blob)) art = <ArtChip />;
  else if (/数据结构|算法|图/.test(blob)) art = <ArtGraph />;

  const s = themeStyle(theme);
  return (
    <div className="dash-cover-art" style={{ background: s.gradient }}>
      <span className="dash-cover-art__orb" style={{ background: s.orb }} />
      <span className="dash-cover-art__orb dash-cover-art__orb--b" style={{ background: s.orb }} />
      {art}
    </div>
  );
}
