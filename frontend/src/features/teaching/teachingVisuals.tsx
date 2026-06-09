import type { ReactNode } from "react";
import { pickCourseTheme, themeStyle, type CourseVisualTheme } from "../dashboard/courseVisuals";

function ArtHomework() {
  return (
    <svg viewBox="0 0 120 80" className="dash-cover-art__svg" aria-hidden>
      <rect x="32" y="18" width="56" height="48" rx="6" fill="rgba(255,255,255,0.28)" />
      <rect x="42" y="30" width="36" height="4" rx="2" fill="rgba(255,255,255,0.55)" />
      <rect x="42" y="40" width="28" height="4" rx="2" fill="rgba(255,255,255,0.4)" />
      <rect x="42" y="50" width="32" height="4" rx="2" fill="rgba(255,255,255,0.35)" />
      <circle cx="78" cy="54" r="10" fill="rgba(255,255,255,0.45)" />
      <path d="M74 54 L77 57 L82 50" stroke="#7c3aed" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function ArtLab() {
  return (
    <svg viewBox="0 0 120 80" className="dash-cover-art__svg" aria-hidden>
      <path
        d="M48 22 L72 22 L82 58 L38 58 Z"
        fill="rgba(255,255,255,0.25)"
        stroke="rgba(255,255,255,0.45)"
        strokeWidth="2"
      />
      <ellipse cx="60" cy="58" rx="22" ry="6" fill="rgba(255,255,255,0.35)" />
      <circle cx="54" cy="42" r="5" fill="rgba(255,255,255,0.55)" />
      <circle cx="66" cy="36" r="4" fill="rgba(255,255,255,0.4)" />
    </svg>
  );
}

function CoverArt({ theme, children }: { theme: CourseVisualTheme; children: ReactNode }) {
  const s = themeStyle(theme);
  return (
    <div className="dash-cover-art teach-cover-art" style={{ background: s.gradient }}>
      <span className="dash-cover-art__orb" style={{ background: s.orb }} />
      <span className="dash-cover-art__orb dash-cover-art__orb--b" style={{ background: s.orb }} />
      {children}
    </div>
  );
}

export function HomeworkCoverArt({ title }: { title: string }) {
  const theme = pickCourseTheme(title, "作业");
  return (
    <CoverArt theme={theme}>
      <ArtHomework />
    </CoverArt>
  );
}

export function LabCoverArt({ title, courseTitle }: { title: string; courseTitle?: string }) {
  const theme = pickCourseTheme(`${courseTitle ?? ""} ${title}`, "实验");
  return (
    <CoverArt theme={theme}>
      <ArtLab />
    </CoverArt>
  );
}
