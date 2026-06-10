import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import EmptyState from "../components/layout/EmptyState";
import MetaChips from "../components/layout/MetaChips";
import PageHeader from "../components/layout/PageHeader";
import PageShell from "../components/layout/PageShell";
import StatusBadge from "../components/layout/StatusBadge";
import { coursePathForRole } from "../lib/coursePaths";

type MyCourseGrade = {
  courseId: string;
  courseTitle: string;
  rank?: number | null;
  classSize?: number | null;
  summary?: {
    labAverage?: number | null;
    homeworkAverage?: number | null;
    totalScore?: number | null;
  };
  weights?: { lab?: number; homework?: number };
};

type AssignmentRow = {
  id: string;
  title: string;
  dueAt: string | null;
  courseId: string;
  courseTitle: string;
  myStatus: string;
  myStatusLabel: string;
  canSubmit: boolean;
  lateHint?: string | null;
};

type SubmissionRow = {
  id: string;
  homeworkId: string;
  content: string;
  graded: boolean;
  released: boolean;
  score: number | null;
  homework: { id: string; title: string; courseId: string; course: { id: string; title: string } };
};

function pctWeight(w: unknown): string {
  const n = Number(w);
  if (!Number.isFinite(n)) return "—";
  return `${Math.round(n * 100)}%`;
}

function assignmentTone(a: AssignmentRow): "ok" | "warn" | "muted" {
  if (a.canSubmit) return "warn";
  if (a.myStatus === "LOCKED" || a.myStatus === "SUBMITTED") return "ok";
  return "muted";
}

export default function MyHomework() {
  const [items, setItems] = useState<SubmissionRow[]>([]);
  const [pending, setPending] = useState<AssignmentRow[]>([]);
  const [grades, setGrades] = useState<MyCourseGrade[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [hw, gr] = await Promise.all([
          api.get("/homework/mine"),
          api.get("/grades/me").catch(() => ({ data: { courses: [] as MyCourseGrade[] } })),
        ]);
        if (!cancelled) {
          setItems(hw.data.submissions ?? []);
          setPending(hw.data.pending ?? []);
          setGrades((gr.data.courses ?? []) as MyCourseGrade[]);
        }
      } catch {
        if (!cancelled) setErr("加载失败");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const finalized = items.filter((s) => s.content?.trim());

  return (
    <PageShell>
      <PageHeader
        title="我的作业"
        lead={`${pending.length} 项待提交 · ${finalized.length} 条已提交`}
        actions={
          <button
            className="btn"
            type="button"
            onClick={async () => {
              try {
                const res = await api.get("/grades/me/export.csv", { responseType: "blob" });
                const blob = res.data as Blob;
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "我的成绩册.csv";
                a.click();
                URL.revokeObjectURL(url);
              } catch {
                /* ignore */
              }
            }}
          >
            导出 CSV
          </button>
        }
      />

      {err ? <div className="page-alert err">{err}</div> : null}

      <section className="panel panel--accent" style={{ marginBottom: 16 }}>
        <div className="panel__head">
          <h2 className="panel__title">待完成作业</h2>
        </div>
        <div className="panel__body">
          {pending.length === 0 ? (
            <EmptyState title="暂无待提交作业">
              <p className="muted">已布置且仍可提交的作业会显示在这里。</p>
            </EmptyState>
          ) : (
            <div className="entity-card-grid">
              {pending.map((a) => (
                <Link
                  key={a.id}
                  className="entity-card entity-card--link homework-student-card"
                  to={coursePathForRole(a.courseId, `homework/${a.id}`, "STUDENT")}
                >
                  <div className="entity-card__head">
                    <h3 className="entity-card__title">{a.title}</h3>
                    <StatusBadge tone={assignmentTone(a)}>{a.myStatusLabel}</StatusBadge>
                  </div>
                  <div className="entity-card__sub">{a.courseTitle}</div>
                  <MetaChips
                    items={[
                      a.dueAt ? `截止 ${new Date(a.dueAt).toLocaleDateString()}` : "无截止",
                      a.lateHint ? "可迟交" : "进行中",
                    ]}
                  />
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="panel" style={{ marginBottom: 16 }}>
        <div className="panel__head">
          <h2 className="panel__title">课程总评</h2>
        </div>
        <div className="panel__body">
          {grades.length === 0 ? (
            <EmptyState title="暂无总评" />
          ) : (
            <div className="entity-card-grid">
              {grades.map((g) => (
                <article key={g.courseId} className="entity-card">
                  <h3 className="entity-card__title">{g.courseTitle}</h3>
                  <MetaChips
                    items={[
                      `总评 ${g.summary?.totalScore == null ? "—" : Number(g.summary.totalScore).toFixed(1)}`,
                      `排名 ${g.rank ?? "—"}`,
                      `实验 ${pctWeight(g.weights?.lab)}`,
                      `作业 ${pctWeight(g.weights?.homework)}`,
                    ]}
                  />
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {finalized.length === 0 ? (
        <EmptyState title="暂无已提交记录" />
      ) : (
        <div className="entity-card-grid">
          {finalized.map((s) => (
            <Link
              key={s.id}
              className="entity-card entity-card--link homework-student-card homework-student-card--done"
              to={coursePathForRole(s.homework.course.id ?? s.homework.courseId, `homework/${s.homework.id ?? s.homeworkId}`, "STUDENT")}
            >
              <div className="entity-card__head">
                <h3 className="entity-card__title">{s.homework.title}</h3>
                <StatusBadge tone={s.released ? "ok" : s.graded ? "warn" : "muted"}>
                  {!s.graded ? "待批改" : s.released ? "已发布" : "待发布"}
                </StatusBadge>
              </div>
              <div className="entity-card__sub">{s.homework.course.title}</div>
              <p style={{ margin: "12px 0 0", fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                {s.content}
              </p>
              {s.released && s.score != null ? (
                <MetaChips items={[`得分 ${s.score}`]} />
              ) : null}
            </Link>
          ))}
        </div>
      )}
    </PageShell>
  );
}
