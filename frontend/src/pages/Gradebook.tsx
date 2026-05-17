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
          <Link className="btn" to={`/courses/${courseId}/grades`}>
            返回课程
          </Link>
        </div>
      </div>
      <div className="muted" style={{ marginTop: 8 }}>
        实验成绩按<strong>实验集</strong>分组：每集内为各题最高分，<strong>集均分</strong>为其算术平均；<strong>实验总均分</strong>为各集均分的算术平均。导出
        CSV 含各题得分与各实验集均分列，UTF-8 BOM 便于 Excel 打开。
      </div>
      {data.labGradingRule ? (
        <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
          {data.labGradingRule}
        </div>
      ) : null}

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
          <div className="muted" style={{ marginTop: 6, fontSize: 13, lineHeight: 1.5 }}>
            按加权总评分段；仅统计已算出总评的学生。「暂无总评」表示实验与作业均分皆不可用（不计入各分段）。
          </div>
          <div className="row" style={{ marginTop: 10, gap: 10, flexWrap: "wrap" }}>
            <span className="muted">&lt;60：{data.distribution.lt60}</span>
            <span className="muted">60–69：{data.distribution.b60_69}</span>
            <span className="muted">70–79：{data.distribution.b70_79}</span>
            <span className="muted">80–89：{data.distribution.b80_89}</span>
            <span className="muted">90+：{data.distribution.gte90}</span>
            <span className="muted">暂无总评：{data.distribution.noTotalScore ?? 0}</span>
          </div>
        </div>
      ) : null}

      <div className="card" style={{ marginTop: 14, overflow: "auto" }}>
        {data.students.length === 0 ? (
          <div className="muted" style={{ padding: 16, lineHeight: 1.7 }}>
            当前还没有选课学生，成绩册为空。请让学生从「课程中心」选课后刷新本页；作业批改请在
            <Link to={`/courses/${courseId}`}>返回课程主页</Link>
            的「作业」区块操作。
          </div>
        ) : null}
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
                  <div className="grid" style={{ gap: 10 }}>
                    {(s.labSets ?? []).length > 0
                      ? (s.labSets as Array<{
                          labSetId: string;
                          labSetTitle: string;
                          setAverage: number | null;
                          labs: Array<{ labId: string; title: string; bestScore: number | null }>;
                        }>).map((g) => (
                          <div key={g.labSetId}>
                            <div style={{ fontWeight: 700, fontSize: 13 }}>
                              {g.labSetTitle}
                              <span className="muted" style={{ fontWeight: 500, marginLeft: 8 }}>
                                集均：
                                {g.setAverage == null ? "—" : `${Number(g.setAverage).toFixed(1)}`}
                              </span>
                            </div>
                            <div className="grid" style={{ marginTop: 4, gap: 4 }}>
                              {g.labs.map((l) => (
                                <div key={l.labId} className="muted" style={{ fontSize: 12, paddingLeft: 8 }}>
                                  {l.title}：{l.bestScore == null ? "—" : `${Number(l.bestScore).toFixed(1)}`}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))
                      : (s.labs ?? []).map((l: any) => (
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
                        {h.title}：
                        {!h.graded ? "未批改" : h.score == null ? "—" : `${Number(h.score).toFixed(1)}`}
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
