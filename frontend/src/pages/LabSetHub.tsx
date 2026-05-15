import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";

type LabRow = { id: string; title: string; language: string };

type Progress = {
  best: number | null;
  latestStatus: string;
  lastAt: string | null;
};

export default function LabSetHub() {
  const { courseId, labSetId } = useParams();
  const [labSet, setLabSet] = useState<any>(null);
  const [progress, setProgress] = useState<Record<string, Progress>>({});
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setErr(null);
      try {
        const { data } = await api.get(`/courses/${courseId}/lab-sets/${labSetId}`);
        if (!cancelled) setLabSet(data.labSet);
      } catch {
        if (!cancelled) setErr("无法加载实验集（请先登录并选课）");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId, labSetId]);

  useEffect(() => {
    const labs: LabRow[] = labSet?.labs ?? [];
    if (labs.length === 0) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        labs.map(async (l) => {
          try {
            const { data } = await api.get(`/labs/${l.id}/submissions`);
            const rows = data.submissions ?? [];
            const scores = rows.map((s: any) => s.score).filter((x: any) => x != null) as number[];
            const best = scores.length ? Math.max(...scores) : null;
            const latestStatus = rows[0]?.status ?? "—";
            const lastAt = rows[0]?.createdAt ?? null;
            return [l.id, { best, latestStatus, lastAt }] as const;
          } catch {
            return [l.id, { best: null, latestStatus: "—", lastAt: null }] as const;
          }
        }),
      );
      if (!cancelled) setProgress(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [labSet]);

  const due = labSet?.dueAt ? new Date(labSet.dueAt) : null;
  const duePast = due != null && !Number.isNaN(due.getTime()) && Date.now() > due.getTime();

  if (!labSet && !err) {
    return (
      <div className="container">
        <div className="muted">加载中…</div>
      </div>
    );
  }

  if (err && !labSet) {
    return (
      <div className="container">
        <div className="err">{err}</div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="muted" style={{ marginTop: 8 }}>
        <Link to={`/courses/${courseId}`}>返回课程</Link>
      </div>
      <h2 style={{ margin: "10px 0 0" }}>{labSet.title}</h2>
      {labSet.description ? (
        <div className="muted" style={{ marginTop: 8, lineHeight: 1.7 }}>
          {labSet.description}
        </div>
      ) : null}

      {due ? (
        <div
          style={{
            marginTop: 12,
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid var(--border)",
            ...(duePast
              ? { background: "rgba(180, 60, 60, 0.09)", color: "var(--err, #c44)" }
              : { background: "rgba(80, 120, 200, 0.08)" }),
          }}
        >
          <strong>{duePast ? "已截止" : "截止时间"}</strong>
          <span style={{ marginLeft: 8 }}>{due.toLocaleString()}</span>
          {duePast ? <span> · 不可再提交评测</span> : null}
        </div>
      ) : (
        <div className="muted" style={{ marginTop: 10 }}>
          本实验集未设置截止时间。
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 900 }}>题目列表</div>
        <div className="muted" style={{ marginTop: 8 }}>
          最近提交与最高分来自你的提交记录；点击进入做题页。
        </div>
        <div className="grid" style={{ marginTop: 12 }}>
          {(labSet.labs as LabRow[]).map((l) => {
            const p = progress[l.id];
            const ac = p?.latestStatus === "ACCEPTED";
            return (
              <div
                key={l.id}
                className="row spread"
                style={{ borderTop: "1px solid var(--border)", paddingTop: 12, alignItems: "center" }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>{l.title}</div>
                  <div className="muted">{l.language}</div>
                  <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>
                    最近提交：{p?.latestStatus ?? "—"}
                    {p?.best != null ? ` · 最高 ${Number(p.best).toFixed(1)} 分` : ""}
                    {p?.lastAt ? ` · ${new Date(p.lastAt).toLocaleString()}` : ""}
                  </div>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  {ac ? (
                    <span className="muted" style={{ color: "var(--ok, #3fb950)", fontWeight: 700 }}>
                      已通过
                    </span>
                  ) : p?.latestStatus && p.latestStatus !== "—" ? (
                    <span className="muted">未满分 / 未完成</span>
                  ) : null}
                  <Link className="btn primary" to={`/courses/${courseId}/labs/${l.id}`}>
                    做题
                  </Link>
                </div>
              </div>
            );
          })}
          {labSet.labs.length === 0 ? <div className="muted">暂无题目</div> : null}
        </div>
      </div>
    </div>
  );
}
