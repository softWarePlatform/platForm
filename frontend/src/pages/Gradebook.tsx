import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";

export default function Gradebook() {
  const { courseId } = useParams();
  const [data, setData] = useState<any>(null);
  const [weights, setWeights] = useState({ labWeight: 0.6, homeworkWeight: 0.4 });
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setErr(null);
      try {
        const { data: d } = await api.get(`/courses/${courseId}/gradebook`);
        if (!cancelled) {
          setData(d);
          if (d.weights) {
            setWeights({
              labWeight: Number(d.weights.lab ?? 0.6),
              homeworkWeight: Number(d.weights.homework ?? 0.4),
            });
          }
        }
      } catch {
        if (!cancelled) setErr("无权查看或课程不存在");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  if (err) {
    return (
      <div className="container">
        <div className="err">{err}</div>
        <Link className="btn" to="/teaching" style={{ display: "inline-block", marginTop: 12 }}>
          返回教学台
        </Link>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="container">
        <div className="muted">加载中…</div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="spread" style={{ marginTop: 10 }}>
        <div>
          <h2 style={{ margin: 0 }}>课程成绩册</h2>
          {data.courseTitle ? (
            <div className="muted" style={{ marginTop: 6 }}>
              {data.courseTitle}
            </div>
          ) : null}
        </div>
        <div className="row">
          <button
            className="btn"
            type="button"
            onClick={async () => {
              try {
                const res = await api.get(`/courses/${courseId}/gradebook/export.csv`, {
                  responseType: "blob",
                });
                const blob = res.data as Blob;
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                const cd = res.headers["content-disposition"] as string | undefined;
                let name = "成绩册.csv";
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
                /* toast optional */
              }
            }}
          >
            导出 CSV
          </button>
          <Link className="btn" to={`/courses/${courseId}`}>
            返回课程
          </Link>
        </div>
      </div>
      <div className="muted" style={{ marginTop: 8 }}>
        展示每位学生各实验最高分与作业分数；「导出 CSV」可用 Excel 打开（UTF-8 BOM）。
      </div>

      <div className="card grid" style={{ marginTop: 14 }}>
        <div style={{ fontWeight: 800 }}>成绩权重配置</div>
        <div className="row">
          <label className="muted">实验权重</label>
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={weights.labWeight}
            onChange={(e) =>
              setWeights((w) => ({ ...w, labWeight: Number(e.target.value) }))
            }
            style={{ width: 90 }}
          />
          <label className="muted">作业权重</label>
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={weights.homeworkWeight}
            onChange={(e) =>
              setWeights((w) => ({ ...w, homeworkWeight: Number(e.target.value) }))
            }
            style={{ width: 90 }}
          />
          <button
            className="btn primary"
            type="button"
            onClick={async () => {
              await api.patch(`/courses/${courseId}/grading-config`, weights);
              const { data: d } = await api.get(`/courses/${courseId}/gradebook`);
              setData(d);
            }}
          >
            保存并重算
          </button>
        </div>
        <div className="muted">要求：实验权重 + 作业权重 = 1。当前总和：{(weights.labWeight + weights.homeworkWeight).toFixed(2)}</div>
      </div>

      {data.distribution ? (
        <div className="card" style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 800 }}>总评分布</div>
          <div className="row" style={{ marginTop: 10, gap: 10 }}>
            <span className="muted">&lt;60：{data.distribution.lt60}</span>
            <span className="muted">60-69：{data.distribution.b60_69}</span>
            <span className="muted">70-79：{data.distribution.b70_79}</span>
            <span className="muted">80-89：{data.distribution.b80_89}</span>
            <span className="muted">90+：{data.distribution.gte90}</span>
          </div>
        </div>
      ) : null}

      <div className="card" style={{ marginTop: 14, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid var(--border)" }}>学生</th>
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid var(--border)" }}>实验汇总</th>
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid var(--border)" }}>作业</th>
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid var(--border)" }}>总评/排名</th>
            </tr>
          </thead>
          <tbody>
            {data.students.map((s: any) => (
              <tr key={s.user.id}>
                <td style={{ padding: 10, borderBottom: "1px solid var(--border)", verticalAlign: "top" }}>
                  <div style={{ fontWeight: 800 }}>{s.user.name}</div>
                  <div className="muted">{s.user.email}</div>
                </td>
                <td style={{ padding: 10, borderBottom: "1px solid var(--border)", verticalAlign: "top" }}>
                  <div className="grid">
                    {s.labs.map((l: any) => (
                      <div key={l.labId} className="muted">
                        {l.title}：{l.bestScore == null ? "—" : `${Number(l.bestScore).toFixed(1)}`}
                      </div>
                    ))}
                  </div>
                </td>
                <td style={{ padding: 10, borderBottom: "1px solid var(--border)", verticalAlign: "top" }}>
                  <div className="grid">
                    {s.homework.map((h: any) => (
                      <div key={h.homeworkId} className="muted">
                        {h.title}：{!h.graded ? "未批改" : `${Number(h.score).toFixed(1)}`}
                      </div>
                    ))}
                  </div>
                </td>
                <td style={{ padding: 10, borderBottom: "1px solid var(--border)", verticalAlign: "top" }}>
                  <div className="muted">实验均分：{s.summary?.labAverage == null ? "—" : Number(s.summary.labAverage).toFixed(1)}</div>
                  <div className="muted">作业均分：{s.summary?.homeworkAverage == null ? "—" : Number(s.summary.homeworkAverage).toFixed(1)}</div>
                  <div style={{ fontWeight: 700, marginTop: 6 }}>
                    总评：{s.summary?.totalScore == null ? "—" : Number(s.summary.totalScore).toFixed(1)}
                  </div>
                  <div className="muted">排名：{s.rank ?? "—"}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
