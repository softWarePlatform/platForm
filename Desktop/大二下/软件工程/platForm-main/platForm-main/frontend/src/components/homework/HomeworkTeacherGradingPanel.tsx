import { useCallback, useEffect, useState } from "react";
import { api } from "../../api/client";
import EmptyState from "../layout/EmptyState";
import MetaChips from "../layout/MetaChips";
import StatusBadge from "../layout/StatusBadge";

type SubmissionRow = {
  id: string;
  content: string;
  updatedAt: string;
  graded: boolean;
  released: boolean;
  score: number | null;
  feedback: string | null;
  submittedAt?: string | null;
  user?: { name?: string; email?: string };
  files?: { id: string; fileName: string; sizeBytes: number }[];
};

type Props = {
  homeworkId: string;
  setErr?: (msg: string | null) => void;
  autoLoad?: boolean;
};

function apiErrorMessage(e: unknown, fallback: string) {
  if (typeof e === "object" && e !== null && "response" in e) {
    return (e as { response?: { data?: { error?: string } } }).response?.data?.error ?? fallback;
  }
  return fallback;
}

function studentFileUrl(homeworkId: string, fileId: string) {
  return `/api/homework/${homeworkId}/submit-files/${fileId}/download`;
}

export default function HomeworkTeacherGradingPanel({
  homeworkId,
  setErr: setParentErr,
  autoLoad = true,
}: Props) {
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { score: string; feedback: string }>>({});
  const [aiPreview, setAiPreview] = useState<
    Record<string, { score: number; feedback: string; source?: string }>
  >({});
  const [aiBusy, setAiBusy] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);

  const setErr = useCallback(
    (msg: string | null) => {
      setLocalErr(msg);
      setParentErr?.(msg);
    },
    [setParentErr],
  );

  const loadSubmissions = useCallback(async () => {
    if (!homeworkId) return;
    setLoading(true);
    setErr(null);
    try {
      const { data } = await api.get(`/homework/${homeworkId}/submissions`);
      const list = (data.submissions ?? []) as SubmissionRow[];
      setSubmissions(list);
      setDrafts((prev) => {
        const next = { ...prev };
        for (const row of list) {
          next[row.id] = {
            score: row.score != null ? String(row.score) : "",
            feedback: row.feedback ?? "",
          };
        }
        return next;
      });
    } catch (e: unknown) {
      setErr(apiErrorMessage(e, "加载提交失败"));
      setSubmissions([]);
    } finally {
      setLoading(false);
    }
  }, [homeworkId, setErr]);

  useEffect(() => {
    if (autoLoad) void loadSubmissions();
  }, [autoLoad, loadSubmissions]);

  const graded = submissions.filter((s) => s.graded).length;
  const released = submissions.filter((s) => s.released).length;
  const nums = submissions
    .filter((s) => s.graded && s.score != null)
    .map((s) => Number(s.score));
  const avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;

  return (
    <section className="panel panel--accent">
      <div className="panel__head panel__head--spread">
        <h2 className="panel__title">批改台</h2>
        <button className="btn btn--sm" type="button" disabled={loading} onClick={() => void loadSubmissions()}>
          {loading ? "加载中…" : "刷新"}
        </button>
      </div>
      <div className="panel__body">
        {localErr ? <div className="page-alert err">{localErr}</div> : null}

        <MetaChips
          items={[
            `提交 ${submissions.length}`,
            `已批改 ${graded}`,
            `已发布 ${released}`,
            avg != null ? `均分 ${avg.toFixed(1)}` : "均分 —",
          ]}
        />

        {submissions.length === 0 && !loading ? (
          <EmptyState title="暂无提交" />
        ) : (
          <div className="grading-list">
            {submissions.map((s) => (
              <article key={s.id} className="grading-card">
                <div className="grading-card__head">
                  <div>
                    <div className="grading-card__name">{s.user?.name}</div>
                    <div className="grading-card__meta">{s.user?.email}</div>
                  </div>
                  <StatusBadge tone={!s.graded ? "warn" : s.released ? "ok" : "muted"}>
                    {!s.graded ? "待批改" : s.released ? "已发布" : "待发布"}
                  </StatusBadge>
                </div>

                {s.content?.trim() ? (
                  <div className="grading-card__content">{s.content}</div>
                ) : (
                  <div className="grading-card__empty">无文字内容</div>
                )}

                {s.files && s.files.length > 0 ? (
                  <ul className="file-list file-list--compact">
                    {s.files.map((f) => (
                      <li key={f.id}>
                        <a href={studentFileUrl(homeworkId, f.id)} target="_blank" rel="noreferrer">
                          {f.fileName}
                        </a>
                        <span className="muted"> ({Math.round(f.sizeBytes / 1024)} KB)</span>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <div className="grading-card__actions">
                  <button
                    className="btn btn--sm"
                    type="button"
                    disabled={aiBusy[s.id]}
                    onClick={async () => {
                      setAiBusy((m) => ({ ...m, [s.id]: true }));
                      setErr(null);
                      try {
                        const { data } = await api.post(`/homework/submissions/${s.id}/ai-suggest`, {
                          apply: false,
                        });
                        setAiPreview((m) => ({
                          ...m,
                          [s.id]: { ...data.suggestion, source: data.source as string | undefined },
                        }));
                      } catch (e: unknown) {
                        setErr(apiErrorMessage(e, "AI 建议失败"));
                      } finally {
                        setAiBusy((m) => ({ ...m, [s.id]: false }));
                      }
                    }}
                  >
                    {aiBusy[s.id] ? "生成中…" : "AI 建议"}
                  </button>
                  <button
                    className="btn btn--sm"
                    type="button"
                    disabled={aiBusy[s.id]}
                    onClick={async () => {
                      setAiBusy((m) => ({ ...m, [s.id]: true }));
                      setErr(null);
                      try {
                        await api.post(`/homework/submissions/${s.id}/ai-suggest`, { apply: true });
                        await loadSubmissions();
                        setAiPreview((m) => {
                          const n = { ...m };
                          delete n[s.id];
                          return n;
                        });
                      } catch (e: unknown) {
                        setErr(apiErrorMessage(e, "应用失败"));
                      } finally {
                        setAiBusy((m) => ({ ...m, [s.id]: false }));
                      }
                    }}
                  >
                    应用 AI
                  </button>
                </div>

                {aiPreview[s.id] ? (
                  <div className="grading-card__ai">
                    <span className="muted">
                      {aiPreview[s.id].source === "heuristic" ? "启发式" : "AI"} · {aiPreview[s.id].score} 分
                    </span>
                    <pre>{aiPreview[s.id].feedback}</pre>
                  </div>
                ) : null}

                <div className="grading-card__grade">
                  <div className="field" style={{ maxWidth: 120 }}>
                    <label>分数</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={drafts[s.id]?.score ?? ""}
                      onChange={(e) =>
                        setDrafts((m) => ({
                          ...m,
                          [s.id]: { score: e.target.value, feedback: m[s.id]?.feedback ?? s.feedback ?? "" },
                        }))
                      }
                    />
                  </div>
                  <div className="field">
                    <label>反馈</label>
                    <textarea
                      rows={2}
                      placeholder="批改反馈"
                      value={drafts[s.id]?.feedback ?? ""}
                      onChange={(e) =>
                        setDrafts((m) => ({
                          ...m,
                          [s.id]: {
                            score: m[s.id]?.score ?? (s.score != null ? String(s.score) : ""),
                            feedback: e.target.value,
                          },
                        }))
                      }
                    />
                  </div>
                  <button
                    className="btn primary btn--sm"
                    type="button"
                    onClick={async () => {
                      const raw = drafts[s.id]?.score ?? "";
                      const score = Number(raw);
                      if (!Number.isFinite(score) || score < 0 || score > 100) {
                        setErr("分数需在 0–100");
                        return;
                      }
                      setErr(null);
                      try {
                        await api.patch(`/homework/submissions/${s.id}/grade`, {
                          score,
                          feedback: (drafts[s.id]?.feedback ?? "").trim() || undefined,
                        });
                        await loadSubmissions();
                      } catch (e: unknown) {
                        setErr(apiErrorMessage(e, "保存失败"));
                      }
                    }}
                  >
                    保存
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
