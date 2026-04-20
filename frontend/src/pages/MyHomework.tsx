import { useEffect, useState } from "react";
import { api } from "../api/client";

export default function MyHomework() {
  const [items, setItems] = useState<any[]>([]);
  const [grades, setGrades] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [hw, gr] = await Promise.all([
          api.get("/homework/mine"),
          api.get("/grades/me").catch(() => ({ data: { courses: [] } })),
        ]);
        if (!cancelled) {
          setItems(hw.data.submissions ?? []);
          setGrades(gr.data.courses ?? []);
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
        <div style={{ fontWeight: 800 }}>课程总评与排名</div>
        <div className="grid" style={{ marginTop: 10 }}>
          {grades.map((g) => (
            <div key={g.courseId} className="row spread" style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
              <div>
                <div style={{ fontWeight: 700 }}>{g.courseTitle}</div>
                <div className="muted">
                  实验均分：{g.summary?.labAverage == null ? "—" : Number(g.summary.labAverage).toFixed(1)} · 作业均分：
                  {g.summary?.homeworkAverage == null ? "—" : Number(g.summary.homeworkAverage).toFixed(1)}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 800 }}>
                  总评：{g.summary?.totalScore == null ? "—" : Number(g.summary.totalScore).toFixed(1)}
                </div>
                <div className="muted">
                  排名：{g.rank ?? "—"} / {g.classSize ?? "—"}
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
