import Editor from "@monaco-editor/react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";

type BottomTab = "examples" | "results" | "ai" | "discussion" | "teacher";

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
  /** 多轮：user / assistant 交替，由服务端在 system 中注入题目与公开样例 */
  const [aiTurns, setAiTurns] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [aiMeta, setAiMeta] = useState<{ source?: string; model?: string | null } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [similarity, setSimilarity] = useState<any>(null);
  const [tc, setTc] = useState<any[]>([]);
  const [tcForm, setTcForm] = useState({ input: "", expected: "", hidden: false, weight: 1 });
  const [err, setErr] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<BottomTab>("examples");
  const [discPosts, setDiscPosts] = useState<any[]>([]);
  const [discScope, setDiscScope] = useState<"lab" | "course">("lab");
  const [discTitle, setDiscTitle] = useState("");
  const [discBody, setDiscBody] = useState("");

  const isTeacher = useMemo(
    () => user?.role === "TEACHER" || user?.role === "ADMIN",
    [user],
  );

  const labDeadline = useMemo(() => {
    const raw = lab?.labSet?.dueAt as string | undefined | null;
    if (raw == null || raw === "") {
      return { hasDue: false as const, past: false as const, display: "" };
    }
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) {
      return { hasDue: false as const, past: false as const, display: "" };
    }
    const past = Date.now() > d.getTime();
    return { hasDue: true as const, past, display: d.toLocaleString() };
  }, [lab]);

  const mdSource = useMemo(() => {
    if (!lab) return "";
    const md = (lab.descriptionMd as string | undefined)?.trim();
    if (md) return md;
    const plain = (lab.description as string | undefined)?.trim();
    return plain ? plain.replace(/\n/g, "\n\n") : "_暂无题干说明。_";
  }, [lab]);

  const examples = useMemo(
    () => (lab?.testCases ?? []) as Array<{ id: string; input: string; expected: string }>,
    [lab],
  );

  useEffect(() => {
    if (!isTeacher && activeTab === "teacher") setActiveTab("examples");
  }, [isTeacher, activeTab]);

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
    setAiTurns([]);
    setAiQ("");
    setAiNotice(null);
    setAiMeta(null);
    setDiscScope("lab");
    setDiscPosts([]);
    setDiscTitle("");
    setDiscBody("");
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

  useEffect(() => {
    if (!courseId || !labId || activeTab !== "discussion") return;
    let cancelled = false;
    (async () => {
      try {
        const url =
          discScope === "lab"
            ? `/labs/${labId}/discussions`
            : `/courses/${courseId}/discussions`;
        const { data } = await api.get(url);
        if (!cancelled) setDiscPosts(data.posts ?? []);
      } catch {
        if (!cancelled) setDiscPosts([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId, labId, activeTab, discScope]);

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
      setActiveTab("results");
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

  function tabBtn(id: BottomTab, label: string) {
    const on = activeTab === id;
    return (
      <button
        key={id}
        type="button"
        className="btn"
        onClick={() => setActiveTab(id)}
        style={{
          borderRadius: 0,
          border: "none",
          borderBottom: on ? "2px solid var(--brand)" : "2px solid transparent",
          background: on ? "rgba(37,99,235,0.06)" : "transparent",
          fontWeight: on ? 800 : 600,
          color: on ? "var(--brand-dark)" : "var(--muted)",
          padding: "10px 14px",
        }}
      >
        {label}
      </button>
    );
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
    <div className="container" style={{ maxWidth: 1440, paddingBottom: 32 }}>
      <style>
        {`
          .lab-md-root { font-size: 15px; line-height: 1.75; color: var(--text); }
          .lab-md-root h1 { font-size: 1.35em; margin: 0.8em 0 0.4em; }
          .lab-md-root h2 { font-size: 1.2em; margin: 0.8em 0 0.35em; }
          .lab-md-root p { margin: 0.5em 0; }
          .lab-md-root ul, .lab-md-root ol { padding-left: 1.25em; margin: 0.5em 0; }
          .lab-md-root pre { background: #f0f2f8; padding: 12px; border-radius: 10px; overflow: auto; font-size: 13px; }
          .lab-md-root code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em; }
          .lab-split {
            display: grid;
            grid-template-columns: minmax(280px, 36%) minmax(0, 1fr);
            gap: 14px;
            align-items: stretch;
            min-height: min(720px, calc(100vh - 200px));
          }
          @media (max-width: 920px) {
            .lab-split { grid-template-columns: 1fr; }
          }
        `}
      </style>

      <div className="row spread" style={{ marginTop: 4, flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <div className="row" style={{ gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <Link to={`/courses/${courseId}`} className="muted">
            返回课程
          </Link>
          {lab.labSet?.id ? (
            <Link to={`/courses/${courseId}/lab-sets/${lab.labSet.id}`} className="muted">
              返回实验集
            </Link>
          ) : null}
        </div>
        <button
          className="btn primary"
          disabled={submitting || (labDeadline.hasDue && labDeadline.past)}
          type="button"
          onClick={() => void submit()}
        >
          {submitting ? "提交中…" : "提交评测"}
        </button>
      </div>

      {labDeadline.hasDue ? (
        <div
          style={{
            marginTop: 10,
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid var(--border)",
            fontSize: 13,
            ...(labDeadline.past
              ? { background: "rgba(180, 60, 60, 0.09)", color: "var(--err, #c44)" }
              : { background: "rgba(80, 120, 200, 0.08)" }),
          }}
        >
          <strong>{labDeadline.past ? "已截止" : "截止时间"}</strong>
          {lab.labSet?.title ? <span className="muted"> · {lab.labSet.title}</span> : null}
          <span style={{ marginLeft: 8 }}>{labDeadline.display}</span>
        </div>
      ) : null}

      {err ? <div className="err" style={{ marginTop: 10 }}>{err}</div> : null}

      <div className="lab-split" style={{ marginTop: 14 }}>
        {/* 左侧：题面（Markdown） */}
        <div
          className="card lab-md-root"
          style={{
            overflow: "auto",
            maxHeight: "calc(100vh - 140px)",
            padding: "16px 18px",
          }}
        >
          <h1 style={{ margin: "0 0 8px", fontSize: "1.45rem", lineHeight: 1.25 }}>{lab.title}</h1>
          <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
            语言：{lab.language}
            {lab.labSet?.title ? ` · 实验集：${lab.labSet.title}` : null}
          </div>
          <div className="lab-md-root">
            <ReactMarkdown>{mdSource}</ReactMarkdown>
          </div>
        </div>

        {/* 右侧：上 IDE，下 Tab */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0, minHeight: 0 }}>
          <div className="card" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div
              className="row spread"
              style={{
                padding: "8px 12px",
                borderBottom: "1px solid var(--border)",
                fontSize: 13,
                color: "var(--muted)",
              }}
            >
              <span>代码编辑器 · Monaco</span>
              <span>{lab.language}</span>
            </div>
            <div style={{ height: "min(46vh, 520px)", minHeight: 260 }}>
              <Editor
                height="100%"
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

          <div
            className="card"
            style={{
              flex: 1,
              minHeight: 220,
              display: "flex",
              flexDirection: "column",
              padding: 0,
              overflow: "hidden",
            }}
          >
            <div
              className="row"
              style={{
                flexWrap: "wrap",
                borderBottom: "1px solid var(--border)",
                gap: 0,
                background: "var(--bg)",
              }}
            >
              {tabBtn("examples", "示例")}
              {tabBtn("results", "测评结果")}
              {tabBtn("ai", "AI 助手")}
              {tabBtn("discussion", "讨论区")}
              {isTeacher ? tabBtn("teacher", "教师") : null}
            </div>

            <div style={{ flex: 1, overflow: "auto", padding: 14 }}>
              {activeTab === "examples" ? (
                <div className="grid" style={{ gap: 12 }}>
                  <div className="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
                    以下为当前题目中<strong>公开</strong>的样例（hidden 用例不会在示例中展示）。
                  </div>
                  {examples.length === 0 ? (
                    <div className="muted">暂无公开样例。</div>
                  ) : (
                    examples.map((t, i) => (
                      <div
                        key={t.id}
                        style={{
                          border: "1px solid var(--border)",
                          borderRadius: 10,
                          padding: 10,
                          background: "#fafbff",
                        }}
                      >
                        <div style={{ fontWeight: 800, marginBottom: 8 }}>样例 {i + 1}</div>
                        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>输入</div>
                        <pre
                          style={{
                            margin: 0,
                            padding: 8,
                            borderRadius: 8,
                            background: "#0b1220",
                            color: "#e6edf7",
                            fontSize: 12,
                            overflow: "auto",
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {t.input === "" ? "（空 stdin）" : t.input}
                        </pre>
                        <div style={{ fontSize: 12, color: "var(--muted)", margin: "8px 0 4px" }}>期望输出</div>
                        <pre
                          style={{
                            margin: 0,
                            padding: 8,
                            borderRadius: 8,
                            background: "#0b1220",
                            color: "#e6edf7",
                            fontSize: 12,
                            overflow: "auto",
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {t.expected}
                        </pre>
                      </div>
                    ))
                  )}
                </div>
              ) : null}

              {activeTab === "results" ? (
                <div className="grid" style={{ gap: 12 }}>
                  <div style={{ fontWeight: 800 }}>最近提交</div>
                  <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
                    {subs.slice(0, 12).map((s) => (
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
                  <div style={{ fontWeight: 800 }}>结果详情</div>
                  {!activeSub ? <div className="muted">点击上方一次提交查看详情</div> : null}
                  {activeSub ? (
                    <pre
                      style={{
                        margin: 0,
                        padding: 12,
                        borderRadius: 12,
                        background: "#0b1220",
                        color: "#e6edf7",
                        overflow: "auto",
                        maxHeight: 280,
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
                </div>
              ) : null}

              {activeTab === "ai" ? (
                <div className="grid" style={{ gap: 10 }}>
                  <div className="muted" style={{ fontSize: 13, lineHeight: 1.65 }}>
                    服务端使用 OpenAI 兼容接口（默认 DeepSeek）；已配置 API Key 时走大模型，否则使用本地规则模板。题目与
                    <strong>公开样例</strong>会写入系统提示，<strong>隐藏用例不会下发</strong>。
                  </div>
                  {aiNotice ? (
                    <div className="muted" style={{ fontSize: 12 }}>
                      {aiNotice}
                    </div>
                  ) : null}
                  {aiMeta?.source ? (
                    <div className="muted" style={{ fontSize: 12 }}>
                      最近回复来源：
                      {aiMeta.source === "llm" ? `大模型${aiMeta.model ? `（${aiMeta.model}）` : ""}` : "本地模板"}
                    </div>
                  ) : null}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      maxHeight: 220,
                      overflow: "auto",
                      padding: 8,
                      borderRadius: 12,
                      background: "var(--panel, #0f1629)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    {aiTurns.length === 0 ? (
                      <div className="muted" style={{ fontSize: 13 }}>
                        在下方输入问题后发送，可继续追问（多轮上下文会一并提交）。
                      </div>
                    ) : (
                      aiTurns.map((t, i) => (
                        <div
                          key={i}
                          style={{
                            alignSelf: t.role === "user" ? "flex-end" : "flex-start",
                            maxWidth: "92%",
                            padding: "8px 10px",
                            borderRadius: 10,
                            background: t.role === "user" ? "var(--accent-muted, #1f3b5c)" : "#0b1220",
                            color: "#e6edf7",
                            fontSize: 13,
                            lineHeight: 1.55,
                          }}
                        >
                          {t.role === "assistant" ? (
                            <ReactMarkdown>{t.content}</ReactMarkdown>
                          ) : (
                            <div style={{ whiteSpace: "pre-wrap" }}>{t.content}</div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                  <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="btn"
                      disabled={aiLoading || aiTurns.length === 0}
                      onClick={() => {
                        setAiTurns([]);
                        setAiNotice(null);
                        setAiMeta(null);
                      }}
                    >
                      清空对话
                    </button>
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
                      const content = aiQ.trim();
                      if (!content) return;
                      const payload = [...aiTurns, { role: "user" as const, content }];
                      setAiTurns(payload);
                      setAiQ("");
                      setAiLoading(true);
                      setErr(null);
                      try {
                        const { data } = await api.post<{
                          answer: string;
                          source?: string;
                          model?: string | null;
                          notice?: string;
                        }>(`/labs/${labId}/ai-help`, { messages: payload });
                        setAiTurns([...payload, { role: "assistant", content: data.answer ?? "" }]);
                        setAiNotice(data.notice ?? null);
                        setAiMeta({ source: data.source, model: data.model });
                      } catch (e: unknown) {
                        setAiTurns((prev) => prev.slice(0, -1));
                        setAiQ(content);
                        const msg =
                          typeof e === "object" && e !== null && "response" in e
                            ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
                            : null;
                        setErr(msg ?? "AI 助手暂不可用");
                      } finally {
                        setAiLoading(false);
                      }
                    }}
                  >
                    {aiLoading ? "生成中…" : "发送"}
                  </button>
                </div>
              ) : null}

              {activeTab === "discussion" ? (
                <div className="grid" style={{ gap: 12 }}>
                  <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className={discScope === "lab" ? "btn primary" : "btn"}
                      onClick={() => setDiscScope("lab")}
                    >
                      本题讨论
                    </button>
                    <button
                      type="button"
                      className={discScope === "course" ? "btn primary" : "btn"}
                      onClick={() => setDiscScope("course")}
                    >
                      课程讨论
                    </button>
                  </div>
                  <div className="muted" style={{ fontSize: 13, lineHeight: 1.65 }}>
                    {discScope === "lab" ? (
                      <>
                        当前为<strong>本题</strong>讨论区，仅本课已选师生可见本帖列表。发帖需已选课或教师身份。
                      </>
                    ) : (
                      <>
                        当前为<strong>课程级</strong>讨论（全课共用，与「本题」列表分开）。发帖需已选课或教师身份。
                      </>
                    )}
                  </div>
                  <form
                    className="grid"
                    style={{ gap: 8 }}
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setErr(null);
                      try {
                        if (discScope === "lab") {
                          await api.post(`/labs/${labId}/discussions`, {
                            title: discTitle.trim(),
                            body: discBody.trim(),
                          });
                        } else {
                          await api.post(`/courses/${courseId}/discussions`, {
                            title: discTitle.trim(),
                            body: discBody.trim(),
                          });
                        }
                        setDiscTitle("");
                        setDiscBody("");
                        const { data } = await api.get(
                          discScope === "lab"
                            ? `/labs/${labId}/discussions`
                            : `/courses/${courseId}/discussions`,
                        );
                        setDiscPosts(data.posts ?? []);
                      } catch (e2: unknown) {
                        const msg =
                          typeof e2 === "object" && e2 !== null && "response" in e2
                            ? (e2 as { response?: { data?: { error?: string } } }).response?.data?.error
                            : null;
                        setErr(msg ?? "发帖失败");
                      }
                    }}
                  >
                    <input
                      placeholder="标题"
                      value={discTitle}
                      onChange={(e) => setDiscTitle(e.target.value)}
                    />
                    <textarea
                      rows={3}
                      placeholder="正文"
                      value={discBody}
                      onChange={(e) => setDiscBody(e.target.value)}
                    />
                    <button className="btn primary" type="submit" disabled={!discTitle.trim() || !discBody.trim()}>
                      发帖
                    </button>
                  </form>
                  <div className="grid" style={{ gap: 10 }}>
                    {discPosts.map((p) => (
                      <div
                        key={p.id}
                        style={{
                          borderTop: "1px solid var(--border)",
                          paddingTop: 10,
                          fontSize: 14,
                        }}
                      >
                        <div style={{ fontWeight: 800 }}>{p.title}</div>
                        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                          {p.user?.name ?? "用户"} · {new Date(p.createdAt).toLocaleString()}
                        </div>
                        <div style={{ marginTop: 8, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{p.body}</div>
                      </div>
                    ))}
                    {discPosts.length === 0 ? <div className="muted">暂无帖子</div> : null}
                  </div>
                </div>
              ) : null}

              {activeTab === "teacher" && isTeacher ? (
                <div className="grid" style={{ gap: 16 }}>
                  <div>
                    <div style={{ fontWeight: 900 }}>测试用例管理</div>
                    <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
                      hidden 用例对学生隐藏 I/O。
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
                        <button className="btn" type="button" onClick={() => void reloadTestcases()}>
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
                      {tc.length === 0 ? <div className="muted">暂无用例</div> : null}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontWeight: 900 }}>实验附件</div>
                    <form
                      className="grid"
                      style={{ marginTop: 10 }}
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
                          setErr(msg ?? "上传失败");
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
                        上传
                      </button>
                    </form>
                    <div className="grid" style={{ marginTop: 10 }}>
                      {files.map((f) => (
                        <div key={f.id} className="row spread" style={{ borderTop: "1px solid var(--border)", paddingTop: 8 }}>
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
                                  setErr("删除失败");
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

                  <div className="muted" style={{ fontSize: 13, lineHeight: 1.65 }}>
                    评测说明：代码从标准输入读入用例，输出须与期望一致（末尾空白已归一）。
                  </div>

                  {activeSub ? (
                    <div>
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
                        代码相似度检测
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
                            maxHeight: 200,
                            fontSize: 11,
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {JSON.stringify(similarity, null, 2)}
                        </pre>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
