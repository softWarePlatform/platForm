import { useEffect, useState } from "react";
import { api } from "../../api/client";
import EmptyState from "../layout/EmptyState";

type GradebookPanelProps = {
  courseId: string;
  showHeader?: boolean;
};

export default function GradebookPanel({ courseId, showHeader = true }: GradebookPanelProps) {
  const [data, setData] = useState<any>(null);
  const [weights, setWeights] = useState({ labWeight: 0.6, homeworkWeight: 0.4 });
  const [err, setErr] = useState<string | null>(null);

  async function reload() {
    const { data: d } = await api.get(`/courses/${courseId}/gradebook`);
    setData(d);
    if (d.weights) {
      setWeights({
        labWeight: Number(d.weights.lab ?? 0.6),
        homeworkWeight: Number(d.weights.homework ?? 0.4),
      });
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setErr(null);
      try {
        const { data: d } = await api.get(`/courses/${courseId}/gradebook`);
        if (cancelled) return;
        setData(d);
        if (d.weights) {
          setWeights({
            labWeight: Number(d.weights.lab ?? 0.6),
            homeworkWeight: Number(d.weights.homework ?? 0.4),
          });
        }
      } catch {
        if (!cancelled) setErr("无法查看成绩统计");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  if (err) return <div className="page-alert err">{err}</div>;
  if (!data) return <div className="panel-loading muted">加载中...</div>;

  return (
    <div className="gradebook-panel">
      {showHeader ? (
        <div className="gradebook-panel__head">
          <div>
            <h2>{data.courseTitle ?? "成绩册"}</h2>
            <p>{data.students?.length ?? 0} 名学生</p>
          </div>
          <button
            className="btn"
            type="button"
            onClick={async () => {
              const res = await api.get(`/courses/${courseId}/gradebook/export.csv`, {
                responseType: "blob",
              });
              const blob = res.data as Blob;
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "成绩册.csv";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            导出 CSV
          </button>
        </div>
      ) : null}

      <section className="panel panel--form panel--accent gradebook-panel__weights">
        <div className="panel__head">
          <h3 className="panel__title">权重配置</h3>
        </div>
        <div className="panel__body">
          <div className="gradebook-weight-row">
            <label>
              实验权重
              <input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={weights.labWeight}
                onChange={(e) => setWeights((w) => ({ ...w, labWeight: Number(e.target.value) }))}
              />
            </label>
            <label>
              作业权重
              <input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={weights.homeworkWeight}
                onChange={(e) => setWeights((w) => ({ ...w, homeworkWeight: Number(e.target.value) }))}
              />
            </label>
            <button
              className="btn primary"
              type="button"
              onClick={async () => {
                await api.patch(`/courses/${courseId}/grading-config`, weights);
                await reload();
              }}
            >
              保存
            </button>
          </div>
        </div>
      </section>

      {data.distribution ? (
        <section className="gradebook-distribution">
          {[
            ["<60", data.distribution.lt60],
            ["60-69", data.distribution.b60_69],
            ["70-79", data.distribution.b70_79],
            ["80-89", data.distribution.b80_89],
            ["90+", data.distribution.gte90],
            ["暂无总评", data.distribution.noTotalScore ?? 0],
          ].map(([label, value]) => (
            <article key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </article>
          ))}
        </section>
      ) : null}

      <section className="panel panel--accent">
        {data.students.length === 0 ? (
          <EmptyState title="暂无学生" />
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
                    <td>
                      <div className="data-table__primary">{s.user.name}</div>
                      <div className="data-table__sub">{s.user.email}</div>
                    </td>
                    <td>
                      <div className="gradebook-cell-list">
                        {(s.labSets ?? []).length > 0
                          ? s.labSets.map((g: any) => (
                              <div key={g.labSetId}>
                                <strong>{g.labSetTitle}</strong>
                                <span>{g.setAverage == null ? "-" : Number(g.setAverage).toFixed(1)}</span>
                              </div>
                            ))
                          : (s.labs ?? []).map((l: any) => (
                              <div key={l.labId}>
                                <strong>{l.title}</strong>
                                <span>{l.bestScore == null ? "-" : Number(l.bestScore).toFixed(1)}</span>
                              </div>
                            ))}
                      </div>
                    </td>
                    <td>
                      <div className="gradebook-cell-list">
                        {s.homework.map((h: any) => (
                          <div key={h.homeworkId}>
                            <strong>{h.title}</strong>
                            <span>{!h.graded || h.score == null ? "-" : Number(h.score).toFixed(1)}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td>
                      <div className="data-table__primary">
                        {s.summary?.totalScore == null ? "-" : Number(s.summary.totalScore).toFixed(1)}
                      </div>
                      <div className="data-table__sub">
                        实验 {s.summary?.labAverage == null ? "-" : Number(s.summary.labAverage).toFixed(1)}
                        {" · "}
                        作业 {s.summary?.homeworkAverage == null ? "-" : Number(s.summary.homeworkAverage).toFixed(1)}
                        {" · "}
                        排名 {s.rank ?? "-"}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
