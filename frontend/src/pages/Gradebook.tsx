import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";

export default function Gradebook() {
  const { courseId } = useParams();
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setErr(null);
      try {
        const { data: d } = await api.get(`/courses/${courseId}/gradebook`);
        if (!cancelled) setData(d);
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
        <h2 style={{ margin: 0 }}>课程成绩册</h2>
        <Link className="btn" to={`/courses/${courseId}`}>
          返回课程
        </Link>
      </div>
      <div className="muted" style={{ marginTop: 8 }}>
        该页为示例统计：展示每位学生各实验最高分与作业分数。线上可导出为 CSV/Excel（导出接口可后续补齐）。
      </div>

      <div className="card" style={{ marginTop: 14, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid var(--border)" }}>学生</th>
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid var(--border)" }}>实验汇总</th>
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid var(--border)" }}>作业</th>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
