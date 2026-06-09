import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { DashboardCourse, DashboardPayload } from "./types";

type Props = {
  data: DashboardPayload;
  role: "STUDENT" | "TEACHER" | "ADMIN";
};

type StatCard = {
  key: string;
  label: string;
  value: string;
  tone: "blue" | "purple" | "teal" | "amber";
  icon: string;
};

function sumPending(courses: DashboardCourse[], field: "pendingHomework" | "pendingLabs") {
  return courses.filter((c) => !c.isHistory).reduce((n, c) => n + (c[field] ?? 0), 0);
}

export default function DashboardStats({ data, role }: Props) {
  const [avgGrade, setAvgGrade] = useState<string | null>(null);

  useEffect(() => {
    if (role !== "STUDENT") return;
    let cancelled = false;
    (async () => {
      try {
        const { data: gr } = await api.get<{ courses?: Array<{ summary?: { totalScore?: number | null } }> }>(
          "/grades/me",
        );
        const scores = (gr.courses ?? [])
          .map((c) => c.summary?.totalScore)
          .filter((s): s is number => s != null && Number.isFinite(s));
        if (!cancelled && scores.length > 0) {
          const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
          setAvgGrade(avg.toFixed(1));
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [role]);

  const active = data.courses.filter((c) => !c.isHistory);
  const cards: StatCard[] =
    role === "STUDENT"
      ? [
          {
            key: "courses",
            label: "进行中的课程",
            value: String(active.length),
            tone: "blue",
            icon: "📘",
          },
          {
            key: "hw",
            label: "待完成作业",
            value: String(sumPending(data.courses, "pendingHomework")),
            tone: "purple",
            icon: "📋",
          },
          {
            key: "lab",
            label: "进行中的实验",
            value: String(sumPending(data.courses, "pendingLabs")),
            tone: "teal",
            icon: "🧪",
          },
          {
            key: "grade",
            label: "平均成绩",
            value: avgGrade ?? "—",
            tone: "amber",
            icon: "🏅",
          },
        ]
      : [
          {
            key: "courses",
            label: "我的课程",
            value: String(active.length),
            tone: "blue",
            icon: "📘",
          },
          {
            key: "hw",
            label: "课程作业总数",
            value: String(active.reduce((n, c) => n + (c.pendingHomework > 0 ? 1 : 0), 0)),
            tone: "purple",
            icon: "📋",
          },
          {
            key: "lab",
            label: "实验待跟进",
            value: String(sumPending(data.courses, "pendingLabs")),
            tone: "teal",
            icon: "🧪",
          },
          {
            key: "ann",
            label: "未读公告",
            value: String(active.reduce((n, c) => n + (c.announcementCount ?? 0), 0)),
            tone: "amber",
            icon: "📣",
          },
        ];

  return (
    <div className="dash-stats">
      {cards.map((c) => (
        <article key={c.key} className={`dash-stat dash-stat--${c.tone}`}>
          <span className="dash-stat__icon" aria-hidden>
            {c.icon}
          </span>
          <div className="dash-stat__body">
            <div className="dash-stat__value">{c.value}</div>
            <div className="dash-stat__label">{c.label}</div>
          </div>
        </article>
      ))}
    </div>
  );
}
