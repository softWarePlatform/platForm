import { useEffect, useState } from "react";
import { api } from "../api/client";

/** 对应 GET /grades/me 的 courses[] 项 */
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

function pctWeight(w: unknown): string {
  const n = Number(w);
  if (!Number.isFinite(n)) return "—";
  return `${Math.round(n * 100)}%`;
}

export default function MyHomework() {
  const [items, setItems] = useState<any[]>([]);
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

  return (
    <div className="container">
      <h2 style={{ marginTop: 10 }}>我的作业</h2>
      {err ? <div className="err">{err}</div> : null}

      <div className="card" style={{ marginTop: 14 }}>
        <div className="row spread" style={{ alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 800 }}>课程总评与排名</div>
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
                const cd = res.headers["content-disposition"] as string | undefined;
                let name = "我的成绩册.csv";
                if (cd?.includes("filename*=")) {
                  const m = cd.match(/filename\*=UTF-8''(.+)/);
                  if (m?.[1]) {
                    try {
                      name = decodeURIComponent(m[1].replace(/;$/, ""));
                    } catch {
                      /* ignore */
                    }
                  }
                }
                a.download = name;
                a.click();
                URL.revokeObjectURL(url);
              } catch {
                /* 忽略 */
              }
            }}
          >
            导出成绩册 CSV
          </button>
        </div>
        <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
          CSV 含各课实验权重、作业权重、实验均分、作业均分、总评、排名、选课人数，以及各实验最高分与各作业分项（未发布成绩不显示具体分数）。
        </div>
        <div className="grid" style={{ marginTop: 10 }}>
          {grades.map((g) => (
            <div key={g.courseId} className="row spread" style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
              <div>
                <div style={{ fontWeight: 700 }}>{g.courseTitle}</div>
                <div className="muted" style={{ marginTop: 4 }}>
                  成绩权重：实验 {pctWeight(g.weights?.lab)} · 作业 {pctWeight(g.weights?.homework)}
                </div>
                <div className="muted" style={{ marginTop: 4 }}>
                  实验均分：{g.summary?.labAverage == null ? "—" : Number(g.summary.labAverage).toFixed(1)} · 作业均分：
                  {g.summary?.homeworkAverage == null ? "—" : Number(g.summary.homeworkAverage).toFixed(1)}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 800 }}>
                  总评：{g.summary?.totalScore == null ? "—" : Number(g.summary.totalScore).toFixed(1)}
                </div>
                <div className="muted" style={{ marginTop: 4 }}>
                  排名：{g.rank ?? "—"}
                  {g.classSize != null ? ` · 班级规模：${g.classSize} 人` : ""}
                </div>
              </div>
            </div>
          ))}
          {grades.length === 0 ? <div className="muted">暂无可用总评</div> : null}
        </div>
      </div>

      <div className="grid" style={{ marginTop: 16 }}>
        {items.map((s) => (
          <div key={s.id} className="card">
            <div style={{ fontWeight: 900 }}>{s.homework.title}</div>
            <div className="muted" style={{ marginTop: 8 }}>
              课程：{s.homework.course.title} · 更新：{new Date(s.updatedAt).toLocaleString()}
            </div>
            <div style={{ marginTop: 12, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{s.content}</div>
            <div className="spread" style={{ marginTop: 12 }}>
              <span className="muted">
                {!s.graded ? "待批改" : s.released ? `得分：${s.score ?? "-"}` : "已批改，待教师发布成绩"}
              </span>
              <span className="muted">{s.released && s.feedback ? `反馈：${s.feedback}` : ""}</span>
            </div>
          </div>
        ))}
        {items.length === 0 ? <div className="muted">暂无提交记录</div> : null}
      </div>
    </div>
  );
}
