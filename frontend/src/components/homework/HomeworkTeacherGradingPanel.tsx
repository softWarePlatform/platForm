import { useCallback, useEffect, useState } from "react";
import { api } from "../../api/client";

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
  /** 为 true 时在挂载时自动加载提交列表 */
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

/**
 * 教师批改台：加载提交、AI 建议、打分与反馈。
 */
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
    <div className="card" style={{ marginTop: 12, boxShadow: "none" }}>
      <div className="row spread" style={{ flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontWeight: 700 }}>批改台</div>
          <div className="muted" style={{ marginTop: 4, fontSize: 12, lineHeight: 1.5 }}>
            AI 建议可在 backend/.env 配置 Ollama 或 OpenAI；分数需教师确认后保存。
          </div>
        </div>
        <button className="btn" type="button" disabled={loading} onClick={() => void loadSubmissions()}>
          {loading ? "加载中…" : "刷新提交"}
        </button>
      </div>

      {localErr ? <div className="err" style={{ marginTop: 8 }}>{localErr}</div> : null}

      <div className="muted" style={{ marginTop: 8, lineHeight: 1.6 }}>
        提交 {submissions.length} · 已批改 {graded} · 成绩已发布 {released}
        {avg != null ? ` · 已批改均分 ${avg.toFixed(1)}` : ""}
      </div>

      <div className="grid" style={{ marginTop: 12 }}>
        {submissions.map((s) => (
          <div key={s.id} style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
            <div className="muted">
              {s.user?.name} · {s.user?.email}
              {s.submittedAt ? ` · 提交于 ${new Date(s.submittedAt).toLocaleString()}` : null}
              {" · 更新 "}
              {new Date(s.updatedAt).toLocaleString()}
              <span style={{ marginLeft: 8 }}>
                {!s.graded ? "· 待批改" : s.released ? "· 成绩已发布" : "· 已批改（待发布）"}
                {s.graded && s.score != null ? ` · 当前分 ${s.score}` : ""}
              </span>
            </div>

            {s.content?.trim() ? (
              <div style={{ marginTop: 8, whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{s.content}</div>
            ) : (
              <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>
                （无文字内容）
              </div>
            )}

            {s.files && s.files.length > 0 ? (
              <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 13 }}>
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

            <div className="row" style={{ marginTop: 10, flexWrap: "wrap", gap: 8 }}>
              <button
                className="btn"
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
                    setErr(apiErrorMessage(e, "AI 建议请求失败"));
                  } finally {
                    setAiBusy((m) => ({ ...m, [s.id]: false }));
                  }
                }}
              >
                {aiBusy[s.id] ? "生成中…" : "AI 建议"}
              </button>
              <button
                className="btn"
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
                    setErr(apiErrorMessage(e, "一键应用失败"));
                  } finally {
                    setAiBusy((m) => ({ ...m, [s.id]: false }));
                  }
                }}
              >
                一键应用 AI
              </button>
            </div>

            {aiPreview[s.id] ? (
              <div className="muted" style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>
                <div style={{ fontSize: 12 }}>
                  来源：{aiPreview[s.id].source === "heuristic" ? "本地启发式" : "AI 模型"}
                </div>
                AI建议分：{aiPreview[s.id].score}
                {"\n"}
                {aiPreview[s.id].feedback}
              </div>
            ) : null}

            <div className="grid" style={{ marginTop: 12 }}>
              <div className="row" style={{ gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <label className="muted">分数（0–100）</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  style={{ width: 96 }}
                  value={drafts[s.id]?.score ?? ""}
                  onChange={(e) =>
                    setDrafts((m) => ({
                      ...m,
                      [s.id]: { score: e.target.value, feedback: m[s.id]?.feedback ?? s.feedback ?? "" },
                    }))
                  }
                />
              </div>
              <textarea
                rows={3}
                placeholder="批改反馈（可选）"
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
              <button
                className="btn primary"
                type="button"
                onClick={async () => {
                  const raw = drafts[s.id]?.score ?? "";
                  const score = Number(raw);
                  if (!Number.isFinite(score) || score < 0 || score > 100) {
                    setErr("请输入 0–100 之间的分数");
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
                    setErr(apiErrorMessage(e, "保存批改失败"));
                  }
                }}
              >
                保存批改
              </button>
            </div>
          </div>
        ))}
        {submissions.length === 0 && !loading ? (
          <div className="muted">暂无学生提交；若刚提交，请点击「刷新提交」。</div>
        ) : null}
      </div>
    </div>
  );
}
