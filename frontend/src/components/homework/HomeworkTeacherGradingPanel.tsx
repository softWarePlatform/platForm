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

type RedoRequestRow = {
  id: string;
  reason?: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  rejectReason?: string | null;
  user?: { id: string; name?: string; email?: string };
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
  const [redoRequests, setRedoRequests] = useState<RedoRequestRow[]>([]);
  const [redoBusy, setRedoBusy] = useState<Record<string, boolean>>({});
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
      const [{ data }, redoRes] = await Promise.all([
        api.get(`/homework/${homeworkId}/submissions`),
        api.get(`/homework/${homeworkId}/redo-requests`).catch(() => ({ data: { requests: [] } })),
      ]);
      const list = (data.submissions ?? []) as SubmissionRow[];
      setSubmissions(list);
      setRedoRequests((redoRes.data.requests ?? []) as RedoRequestRow[]);
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
      setRedoRequests([]);
    } finally {
      setLoading(false);
    }
  }, [homeworkId, setErr]);

  useEffect(() => {
    if (autoLoad) void loadSubmissions();
  }, [autoLoad, loadSubmissions]);

  const graded = submissions.filter((s) => s.graded).length;
  const released = submissions.filter((s) => s.released).length;
  const pendingRedoCount = redoRequests.filter((r) => r.status === "PENDING").length;
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

        <section className="redo-panel-inline">
          <div className="redo-panel-inline__head">
            <h3>重做申请</h3>
            <span>{pendingRedoCount} 待审批 / {redoRequests.length} 条</span>
          </div>
          {redoRequests.length === 0 ? (
            <EmptyState title="暂无重做申请" />
          ) : (
            <div className="redo-list">
              {redoRequests.map((r) => (
                <article key={r.id} className="redo-card">
                  <div className="redo-card__head">
                    <strong>{r.user?.name ?? "学生"}</strong>
                    <span className="muted">{r.user?.email}</span>
                    <StatusBadge tone={r.status === "PENDING" ? "warn" : r.status === "APPROVED" ? "ok" : "muted"}>
                      {r.status === "PENDING" ? "待审批" : r.status === "APPROVED" ? "已通过" : "已拒绝"}
                    </StatusBadge>
                  </div>
                  <p className="redo-card__body">{r.reason || "（未填写理由）"}</p>
                  {r.rejectReason ? <p className="redo-card__body muted">拒绝原因：{r.rejectReason}</p> : null}
                  {r.status === "PENDING" ? (
                    <div className="redo-card__actions">
                      <button
                        className="btn primary btn--sm"
                        type="button"
                        disabled={redoBusy[r.id]}
                        onClick={async () => {
                          setRedoBusy((m) => ({ ...m, [r.id]: true }));
                          setErr(null);
                          try {
                            await api.patch(`/homework/redo-requests/${r.id}`, { action: "approve" });
                            await loadSubmissions();
                          } catch (e: unknown) {
                            setErr(apiErrorMessage(e, "通过失败"));
                          } finally {
                            setRedoBusy((m) => ({ ...m, [r.id]: false }));
                          }
                        }}
                      >
                        通过
                      </button>
                      <button
                        className="btn btn--sm"
                        type="button"
                        disabled={redoBusy[r.id]}
                        onClick={async () => {
                          const rejectReason = window.prompt("拒绝原因（可选）") ?? "";
                          setRedoBusy((m) => ({ ...m, [r.id]: true }));
                          setErr(null);
                          try {
                            await api.patch(`/homework/redo-requests/${r.id}`, {
                              action: "reject",
                              rejectReason: rejectReason.trim() || undefined,
                            });
                            await loadSubmissions();
                          } catch (e: unknown) {
                            setErr(apiErrorMessage(e, "拒绝失败"));
                          } finally {
                            setRedoBusy((m) => ({ ...m, [r.id]: false }));
                          }
                        }}
                      >
                        拒绝
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>

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
