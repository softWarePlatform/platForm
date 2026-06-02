import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import LabSetTimeBanner from "../features/labs/LabSetTimeBanner";

type LabRow = { id: string; title: string; language: string };

type Progress = {
  best: number | null;
  latestStatus: string;
  lastAt: string | null;
  /** 是否存在至少一次 AC（与实验集完成/进度条逻辑一致） */
  passed: boolean;
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
      } catch (e: unknown) {
        if (!cancelled) {
          const msg =
            typeof e === "object" && e !== null && "response" in e
              ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
              : null;
          setErr(msg ?? "无法加载实验集（请先登录并选课）");
        }
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
            const passed = rows.some((s: { status?: string }) => s.status === "ACCEPTED");
            return [l.id, { best, latestStatus, lastAt, passed }] as const;
          } catch {
            return [l.id, { best: null, latestStatus: "—", lastAt: null, passed: false }] as const;
          }
        }),
      );
      if (!cancelled) setProgress(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [labSet]);

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
        <div className="muted" style={{ marginTop: 12 }}>
          <Link to={`/courses/${courseId}`}>返回课程</Link>
        </div>
      </div>
    );
  }

  const canSubmit = labSet.access?.canSubmit !== false;

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

      <LabSetTimeBanner labSet={labSet} />

      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 900 }}>题目列表</div>
        <div className="muted" style={{ marginTop: 8 }}>
          最近提交与最高分来自你的提交记录；点击进入做题页。
          {!canSubmit ? " · 当前不可提交评测" : null}
        </div>
        <div className="grid" style={{ marginTop: 12 }}>
          {(labSet.labs as LabRow[]).map((l) => {
            const p = progress[l.id];
            const ac = p?.passed === true;
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
