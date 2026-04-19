import Editor from "@monaco-editor/react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";

export default function Lab() {
  const { courseId, labId } = useParams();
  const { user } = useAuth();
  const [lab, setLab] = useState<any>(null);
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [subs, setSubs] = useState<any[]>([]);
  const [activeSub, setActiveSub] = useState<any>(null);
  const [feedback, setFeedback] = useState<any>(null);
  const [files, setFiles] = useState<any[]>([]);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [aiQ, setAiQ] = useState("");
  const [aiA, setAiA] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [similarity, setSimilarity] = useState<any>(null);
  const [tc, setTc] = useState<any[]>([]);
  const [tcForm, setTcForm] = useState({ input: "", expected: "", hidden: false, weight: 1 });
  const [err, setErr] = useState<string | null>(null);

  const isTeacher = useMemo(
    () => user?.role === "TEACHER" || user?.role === "ADMIN",
    [user],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setErr(null);
      try {
        const { data } = await api.get(`/labs/${labId}`);
        if (cancelled) return;
        setLab(data.lab);
        setCode(data.lab.starterCode ?? "");
      } catch {
        if (!cancelled) setErr("无法加载实验（先登录并选课）");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [labId]);

  useEffect(() => {
    if (!isTeacher) return;
    reloadTestcases().catch(() => {
      /* ignore */
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTeacher, labId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get(`/labs/${labId}/submissions`);
        if (!cancelled) setSubs(data.submissions ?? []);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [labId, submitting]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get(`/labs/${labId}/files`);
        if (!cancelled) setFiles(data.files ?? []);
      } catch {
        if (!cancelled) setFiles([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [labId]);

  async function submit() {
    setSubmitting(true);
    setErr(null);
    try {
      await api.post(`/labs/${labId}/submit`, { code });
      const { data } = await api.get(`/labs/${labId}/submissions`);
      setSubs(data.submissions ?? []);
      const newest = data.submissions?.[0];
      if (newest?.id) {
        const r = await api.get(`/submissions/${newest.id}`);
        setActiveSub(r.data.submission);
        try {
          const fb = await api.get(`/submissions/${newest.id}/feedback`);
          setFeedback(fb.data);
        } catch {
          setFeedback(null);
        }
      }
    } catch (e: unknown) {
      const msg =
        typeof e === "object" && e !== null && "response" in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : null;
      setErr(msg ?? "提交失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function reloadFiles() {
    const { data } = await api.get(`/labs/${labId}/files`);
    setFiles(data.files ?? []);
  }

  async function reloadTestcases() {
    if (!isTeacher) return;
    const { data } = await api.get(`/labs/${labId}/testcases`);
    setTc(data.testCases ?? []);
  }

  if (!lab && !err) {
    return (
      <div className="container">
        <div className="muted">加载中…</div>
      </div>
    );
  }

  if (err && !lab) {
    return (
      <div className="container">
        <div className="err">{err}</div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="spread" style={{ marginTop: 8 }}>
        <div>
          <div className="muted">
            <Link to={`/courses/${courseId}`}>返回课程</Link>
          </div>
          <h2 style={{ margin: "8px 0 0" }}>{lab.title}</h2>
          <div className="muted" style={{ marginTop: 8, lineHeight: 1.7 }}>
            {lab.description ?? ""}
          </div>
        </div>
        <button className="btn primary" disabled={submitting} type="button" onClick={submit}>
          {submitting ? "提交中…" : "提交评测"}
        </button>
      </div>

      {err ? <div className="err" style={{ marginTop: 10 }}>{err}</div> : null}

      <div className="grid" style={{ marginTop: 14, gridTemplateColumns: "1fr 360px", alignItems: "start" }}>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ borderBottom: "1px solid var(--border)", padding: 12 }} className="spread">
            <span className="muted">语言：{lab.language}</span>
            <span className="muted">编辑器：Monaco</span>
          </div>
          <div style={{ height: 520 }}>
            <Editor
              height="520px"
              theme="vs-dark"
              defaultLanguage={lab.language === "python" ? "python" : "javascript"}
              value={code}
              onChange={(v) => setCode(v ?? "")}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                automaticLayout: true,
              }}
            />
          </div>
        </div>

        <div className="grid">
          {isTeacher ? (
            <div className="card">
              <div style={{ fontWeight: 900 }}>测试用例管理（教师）</div>
              <div className="muted" style={{ marginTop: 8 }}>
                添加/修改/删除用例；hidden 用例只对学生隐藏 I/O。
              </div>
              <form
                className="grid"
                style={{ marginTop: 10 }}
                onSubmit={async (e) => {
                  e.preventDefault();
                  setErr(null);
                  try {
                    await api.post(`/labs/${labId}/testcases`, tcForm);
                    setTcForm({ input: "", expected: "", hidden: false, weight: 1 });
                    await reloadTestcases();
                  } catch (e2: unknown) {
                    const msg =
                      typeof e2 === "object" && e2 !== null && "response" in e2
                        ? (e2 as { response?: { data?: { error?: string } } }).response?.data?.error
                        : null;
                    setErr(msg ?? "添加用例失败");
                  }
                }}
              >
                <textarea
                  rows={2}
                  placeholder="input（stdin）"
                  value={tcForm.input}
                  onChange={(e) => setTcForm({ ...tcForm, input: e.target.value })}
                />
                <textarea
                  rows={2}
                  placeholder="expected（stdout）"
                  value={tcForm.expected}
                  onChange={(e) => setTcForm({ ...tcForm, expected: e.target.value })}
                />
                <div className="row">
                  <label className="row muted">
                    <input
                      type="checkbox"
                      checked={tcForm.hidden}
                      onChange={(e) => setTcForm({ ...tcForm, hidden: e.target.checked })}
                    />
                    隐藏
                  </label>
                  <input
                    style={{ width: 90 }}
                    type="number"
                    min={1}
                    value={tcForm.weight}
                    onChange={(e) => setTcForm({ ...tcForm, weight: Number(e.target.value) })}
                  />
                  <button className="btn" type="submit">
                    添加
                  </button>
                  <button
                    className="btn"
                    type="button"
                    onClick={() => void reloadTestcases()}
                  >
                    刷新
                  </button>
                </div>
              </form>

              <div className="grid" style={{ marginTop: 10 }}>
                {tc.map((t) => (
                  <div key={t.id} style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                    <div className="row spread">
                      <span className="muted">
                        {t.hidden ? "隐藏" : "公开"} · weight {t.weight}
                      </span>
                      <div className="row">
                        <button
                          className="btn"
                          type="button"
                          onClick={async () => {
                            await api.delete(`/testcases/${t.id}`);
                            await reloadTestcases();
                          }}
                        >
                          删除
                        </button>
                      </div>
                    </div>
                    <textarea
                      rows={2}
                      defaultValue={t.input}
                      onBlur={async (e) => {
                        const v = e.target.value;
                        if (v === t.input) return;
                        await api.patch(`/testcases/${t.id}`, { input: v });
                        await reloadTestcases();
                      }}
                    />
                    <textarea
                      rows={2}
                      defaultValue={t.expected}
                      onBlur={async (e) => {
                        const v = e.target.value;
                        if (v === t.expected) return;
                        await api.patch(`/testcases/${t.id}`, { expected: v });
                        await reloadTestcases();
                      }}
                    />
                  </div>
                ))}
                {tc.length === 0 ? <div className="muted">暂无用例（建议至少添加 1 条）</div> : null}
              </div>
            </div>
          ) : null}

          <div className="card">
            <div style={{ fontWeight: 900 }}>实验附件</div>
            <div className="muted" style={{ marginTop: 8 }}>
              教师可上传给学生的说明/数据文件；学生可下载。
            </div>

            <div className="grid" style={{ marginTop: 10 }}>
              <form
                className="grid"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!uploadFile) return;
                  setErr(null);
                  try {
                    const fd = new FormData();
                    fd.append("file", uploadFile);
                    fd.append("title", uploadTitle || uploadFile.name);
                    await api.post(`/labs/${labId}/files`, fd);
                    setUploadFile(null);
                    setUploadTitle("");
                    await reloadFiles();
                  } catch (e2: unknown) {
                    const msg =
                      typeof e2 === "object" && e2 !== null && "response" in e2
                        ? (e2 as { response?: { data?: { error?: string } } }).response?.data?.error
                        : null;
                    setErr(msg ?? "上传失败（仅教师可上传）");
                  }
                }}
              >
                <input
                  placeholder="标题（可选）"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                />
                <input type="file" onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)} />
                <button className="btn" type="submit" disabled={!uploadFile}>
                  上传（教师）
                </button>
              </form>

              {files.map((f) => (
                <div key={f.id} className="row spread" style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                  <span className="muted">
                    {f.title}（{(f.sizeBytes / 1024).toFixed(1)} KB）
                  </span>
                  <div className="row">
                    <button
                      type="button"
                      className="btn"
                      onClick={async () => {
                        const res = await api.get(`/labs/${labId}/files/${f.id}/download`, {
                          responseType: "blob",
                        });
                        const url = URL.createObjectURL(res.data);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = f.fileName;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                    >
                      下载
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={async () => {
                        try {
                          await api.delete(`/labs/${labId}/files/${f.id}`);
                          await reloadFiles();
                        } catch {
                          setErr("删除失败（仅教师可删）");
                        }
                      }}
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
              {files.length === 0 ? <div className="muted">暂无附件</div> : null}
            </div>
          </div>

          <div className="card">
            <div style={{ fontWeight: 900 }}>AI 问答助手（本地版）</div>
            <div className="muted" style={{ marginTop: 8, lineHeight: 1.7 }}>
              根据实验描述与公开样例给出解题提示（不调用外部服务，便于作业演示）。
            </div>
            <textarea
              rows={3}
              placeholder="例如：我应该如何读取输入？输出格式有什么坑？"
              value={aiQ}
              onChange={(e) => setAiQ(e.target.value)}
            />
            <button
              className="btn primary"
              type="button"
              disabled={aiLoading || !aiQ.trim()}
              onClick={async () => {
                setAiLoading(true);
                setAiA(null);
                setErr(null);
                try {
                  const { data } = await api.post(`/labs/${labId}/ai-help`, { question: aiQ });
                  setAiA(data.answer ?? "");
                } catch (e2: unknown) {
                  const msg =
                    typeof e2 === "object" && e2 !== null && "response" in e2
                      ? (e2 as { response?: { data?: { error?: string } } }).response?.data?.error
                      : null;
                  setErr(msg ?? "AI 助手暂不可用");
                } finally {
                  setAiLoading(false);
                }
              }}
            >
              {aiLoading ? "生成中…" : "获取提示"}
            </button>
            {aiA ? (
              <pre
                style={{
                  marginTop: 10,
                  padding: 12,
                  borderRadius: 12,
                  background: "#0b1220",
                  color: "#e6edf7",
                  overflow: "auto",
                  maxHeight: 240,
                  fontSize: 12,
                  whiteSpace: "pre-wrap",
                }}
              >
                {aiA}
              </pre>
            ) : null}
          </div>

          <div className="card">
            <div style={{ fontWeight: 900 }}>评测说明</div>
            <div className="muted" style={{ marginTop: 8, lineHeight: 1.7 }}>
              后端将代码以文件方式运行，并从标准输入读入测试用例。请保证输出与样例完全一致（不含多余空格行，系统会
              trim 末尾换行差异已做归一）。
            </div>
          </div>

          <div className="card">
            <div style={{ fontWeight: 900 }}>最近提交</div>
            <div className="grid" style={{ marginTop: 10 }}>
              {subs.slice(0, 8).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="btn"
                  onClick={async () => {
                    const r = await api.get(`/submissions/${s.id}`);
                    setActiveSub(r.data.submission);
                    setSimilarity(null);
                    try {
                      const fb = await api.get(`/submissions/${s.id}/feedback`);
                      setFeedback(fb.data);
                    } catch {
                      setFeedback(null);
                    }
                  }}
                >
                  {new Date(s.createdAt).toLocaleString()} · {s.status} ·{" "}
                  {s.score == null ? "-" : `${Number(s.score).toFixed(1)} 分`}
                </button>
              ))}
              {subs.length === 0 ? <div className="muted">暂无提交</div> : null}
            </div>
          </div>

          <div className="card">
            <div style={{ fontWeight: 900 }}>结果详情</div>
            {!activeSub ? <div className="muted" style={{ marginTop: 10 }}>选择一次提交查看</div> : null}
            {activeSub ? (
              <pre
                style={{
                  marginTop: 10,
                  padding: 12,
                  borderRadius: 12,
                  background: "#0b1220",
                  color: "#e6edf7",
                  overflow: "auto",
                  maxHeight: 320,
                  fontSize: 12,
                }}
              >
                {JSON.stringify(
                  feedback
                    ? feedback
                    : {
                        status: activeSub.status,
                        score: activeSub.score,
                        result: (() => {
                          if (!activeSub.resultJson) return null;
                          try {
                            return JSON.parse(activeSub.resultJson);
                          } catch {
                            return activeSub.resultJson;
                          }
                        })(),
                      },
                  null,
                  2,
                )}
              </pre>
            ) : null}

            {activeSub && isTeacher ? (
              <div style={{ marginTop: 10 }}>
                <button
                  className="btn"
                  type="button"
                  onClick={async () => {
                    setErr(null);
                    try {
                      const { data } = await api.get(`/submissions/${activeSub.id}/similarity`);
                      setSimilarity(data);
                    } catch (e2: unknown) {
                      const msg =
                        typeof e2 === "object" && e2 !== null && "response" in e2
                          ? (e2 as { response?: { data?: { error?: string } } }).response?.data?.error
                          : null;
                      setErr(msg ?? "相似度检测失败");
                    }
                  }}
                >
                  代码相似度检测（教师）
                </button>
                {similarity ? (
                  <pre
                    style={{
                      marginTop: 10,
                      padding: 12,
                      borderRadius: 12,
                      background: "#0b1220",
                      color: "#e6edf7",
                      overflow: "auto",
                      maxHeight: 220,
                      fontSize: 12,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {JSON.stringify(similarity, null, 2)}
                  </pre>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
