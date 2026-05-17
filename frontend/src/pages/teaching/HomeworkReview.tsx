import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api/client";

export default function HomeworkTeacherReview() {
  const { homeworkId } = useParams();
  const [meta, setMeta] = useState<{
    id: string;
    title: string;
    description: string | null;
    courseId: string;
    courseTitle: string;
    published: boolean;
  } | null>(null);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { score: string; feedback: string }>>({});
  const [aiPreview, setAiPreview] = useState<
    Record<string, { score: number; feedback: string; source?: string }>
  >({});
  const [aiBusy, setAiBusy] = useState<Record<string, boolean>>({});
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!homeworkId) return;
    setErr(null);
    try {
      const { data } = await api.get(`/homework/${homeworkId}/submissions`);
      setMeta(data.homework ?? null);
      const list = data.submissions ?? [];
      setSubmissions(list);
      setDrafts((prev) => {
        const next = { ...prev };
        for (const s of list) {
          if (next[s.id] == null) {
            next[s.id] = {
              score: s.score != null ? String(s.score) : "",
              feedback: s.feedback ?? "",
            };
          }
        }
        return next;
      });
    } catch {
      setErr("无权查看或作业不存在");
      setMeta(null);
      setSubmissions([]);
    }
  }, [homeworkId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function exportCsv() {
    if (!homeworkId) return;
    try {
      const res = await api.get(`/homework/${homeworkId}/export-grades.csv`, { responseType: "blob" });
      const blob = res.data as Blob;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = res.headers["content-disposition"] as string | undefined;
      let name = "作业成绩.csv";
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
      setErr("导出失败");
    }
  }

  if (err && !meta) {
    return (
      <div className="container">
        <div className="err">{err}</div>
        <Link className="btn" to="/teaching/homework" style={{ display: "inline-block", marginTop: 12 }}>
          返回作业列表
        </Link>
      </div>
    );
  }

  if (!meta) {
    return (
      <div className="container">
        <div className="muted">加载中…</div>
      </div>
    );
  }

  const graded = submissions.filter((s) => s.graded).length;
  const released = submissions.filter((s) => s.released).length;
  const nums = submissions.filter((s) => s.graded && s.score != null).map((s) => Number(s.score));
  const avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;

  return (
    <div className="container">
      <div className="spread" style={{ marginTop: 10, alignItems: "flex-start" }}>
        <div>
          <h2 style={{ margin: 0 }}>{meta.title}</h2>
          <div className="muted" style={{ marginTop: 6 }}>
            {meta.courseTitle} · {meta.published ? "已发布" : "未发布"}
          </div>
          {meta.description ? (
            <div className="muted" style={{ marginTop: 8, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
              {meta.description}
            </div>
          ) : null}
        </div>
        <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
          <button className="btn" type="button" onClick={() => void exportCsv()}>
            导出本作业成绩 CSV
          </button>
          <button
            className="btn primary"
            type="button"
            onClick={async () => {
              await api.patch(`/homework/${homeworkId}/release-grades`, {});
              await load();
            }}
          >
            发布已批改成绩
          </button>
        </div>
      </div>

      <div className="row" style={{ marginTop: 12, gap: 10, flexWrap: "wrap" }}>
        <Link className="btn" to="/teaching/homework">
          ← 作业测评列表
        </Link>
        <Link className="btn" to={`/courses/${meta.courseId}/announcements`}>
          课程主页
        </Link>
        <Link className="btn" to={`/courses/${meta.courseId}/homework`}>
          课程内作业
        </Link>
      </div>

      {err ? <div className="err" style={{ marginTop: 10 }}>{err}</div> : null}

      <div className="card" style={{ marginTop: 14 }}>
        <div style={{ fontWeight: 800 }}>统计</div>
        <div className="muted" style={{ marginTop: 8, lineHeight: 1.7 }}>
          提交 {submissions.length} · 已批改 {graded} · 成绩已发布 {released}
          {avg != null ? ` · 已批改均分 ${avg.toFixed(1)}` : ""}
        </div>
      </div>

      <div className="grid" style={{ marginTop: 16 }}>
        {submissions.map((s) => (
          <div key={s.id} className="card">
            <div className="muted">
              {s.user?.name} · {s.user?.email} · {new Date(s.updatedAt).toLocaleString()}
              <span style={{ marginLeft: 8 }}>
                {!s.graded ? "待批改" : s.released ? "成绩已发布" : "已批改（待发布）"}
                {s.graded && s.score != null ? ` · 当前分 ${s.score}` : ""}
              </span>
            </div>
            <div style={{ marginTop: 10, whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{s.content}</div>

            <div className="row" style={{ marginTop: 10, flexWrap: "wrap", gap: 8 }}>
              <button
                className="btn"
                type="button"
                disabled={aiBusy[s.id]}
                onClick={async () => {
                  setAiBusy((m) => ({ ...m, [s.id]: true }));
                  setErr(null);
                  try {
                    const { data } = await api.post(`/homework/submissions/${s.id}/ai-suggest`, { apply: false });
                    setAiPreview((m) => ({
                      ...m,
                      [s.id]: { ...data.suggestion, source: data.source as string | undefined },
                    }));
                  } catch {
                    setErr("AI 建议请求失败");
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
                    await load();
                    setAiPreview((m) => {
                      const n = { ...m };
                      delete n[s.id];
                      return n;
                    });
                  } catch {
                    setErr("一键应用失败");
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
                  来源：
                  {aiPreview[s.id].source === "heuristic" ? "本地启发式" : "AI 模型"}
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
                    [s.id]: { score: m[s.id]?.score ?? (s.score != null ? String(s.score) : ""), feedback: e.target.value },
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
                  await api.patch(`/homework/submissions/${s.id}/grade`, {
                    score,
                    feedback: (drafts[s.id]?.feedback ?? "").trim() || undefined,
                  });
                  await load();
                }}
              >
                保存批改
              </button>
            </div>
          </div>
        ))}
        {submissions.length === 0 ? <div className="muted">暂无学生提交。</div> : null}
      </div>
    </div>
  );
}
