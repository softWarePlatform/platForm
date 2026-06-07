import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import EmptyState from "../components/layout/EmptyState";
import PageHeader from "../components/layout/PageHeader";
import PageShell from "../components/layout/PageShell";

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
      <PageShell>
        <div className="page-alert err">{err}</div>
        <Link className="btn" to="/teaching">
          返回教学台
        </Link>
      </PageShell>
    );
  }

  if (!data) {
    return (
      <PageShell>
        <div className="panel-loading muted">加载中…</div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title="成绩册"
        lead={data.courseTitle ?? `${data.students?.length ?? 0} 名学生`}
        actions={
          <>
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
          </>
        }
      />

      <section className="panel panel--form panel--accent" style={{ marginBottom: 16 }}>
        <div className="panel__head">
          <h2 className="panel__title">权重配置</h2>
        </div>
        <div className="panel__body grid">
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
        </div>
      </section>

      {data.distribution ? (
        <section className="panel panel--accent" style={{ marginBottom: 16 }}>
          <div className="panel__head">
            <h2 className="panel__title">总评分布</h2>
          </div>
          <div className="panel__body">
            <div className="meta-chips">
              <span className="meta-chips__item">&lt;60 · {data.distribution.lt60}</span>
              <span className="meta-chips__item">60–69 · {data.distribution.b60_69}</span>
              <span className="meta-chips__item">70–79 · {data.distribution.b70_79}</span>
              <span className="meta-chips__item">80–89 · {data.distribution.b80_89}</span>
              <span className="meta-chips__item">90+ · {data.distribution.gte90}</span>
              <span className="meta-chips__item">无总评 · {data.distribution.noTotalScore ?? 0}</span>
            </div>
          </div>
        </section>
      ) : null}

      <section className="panel panel--accent">
        {data.students.length === 0 ? (
          <EmptyState title="暂无学生">
            <Link to={`/courses/${courseId}/announcements`}>返回课程</Link>
          </EmptyState>
        ) : (
        <div className="data-table-wrap panel__body--flush">
        <table className="data-table">
          <thead>
            <tr>
              <th>学生</th>
              <th>实验</th>
              <th>作业</th>
              <th>总评</th>
            </tr>
          </thead>
          <tbody>
            {data.students.map((s: any) => (
              <tr key={s.user.id}>
                <td style={{ verticalAlign: "top" }}>
                  <div className="data-table__primary">{s.user.name}</div>
                  <div className="data-table__sub">{s.user.email}</div>
                </td>
                <td style={{ verticalAlign: "top" }}>
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
                <td style={{ verticalAlign: "top" }}>
                  <div className="grid">
                    {s.homework.map((h: any) => (
                      <div key={h.homeworkId} className="muted" style={{ fontSize: 13 }}>
                        {h.title} · {!h.graded ? "—" : h.score == null ? "—" : Number(h.score).toFixed(1)}
                      </div>
                    ))}
                  </div>
                </td>
                <td style={{ verticalAlign: "top" }}>
                  <div className="data-table__primary">
                    {s.summary?.totalScore == null ? "—" : Number(s.summary.totalScore).toFixed(1)}
                  </div>
                  <div className="data-table__sub">
                    实验 {s.summary?.labAverage == null ? "—" : Number(s.summary.labAverage).toFixed(1)} · 作业{" "}
                    {s.summary?.homeworkAverage == null ? "—" : Number(s.summary.homeworkAverage).toFixed(1)} · 排名{" "}
                    {s.rank ?? "—"}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        )}
      </section>
    </PageShell>
  );
}
