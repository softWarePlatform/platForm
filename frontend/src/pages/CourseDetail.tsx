import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";

function KgPreview({ json }: { json: string }) {
  try {
    const g = JSON.parse(json) as { nodes?: { id: string; label: string }[]; edges?: { from: string; to: string; label?: string }[] };
    const nodes = g.nodes ?? [];
    const edges = g.edges ?? [];
    return (
      <div className="grid" style={{ marginTop: 10, fontSize: 13, lineHeight: 1.6 }}>
        <div>
          <strong>节点</strong>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {nodes.map((n) => (
              <li key={n.id}>{n.label}</li>
            ))}
          </ul>
        </div>
        <div>
          <strong>关系</strong>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {edges.map((e, i) => (
              <li key={i}>
                {e.from} → {e.to}
                {e.label ? `（${e.label}）` : ""}
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  } catch {
    return <div className="muted">图谱数据格式异常</div>;
  }
}

export default function CourseDetail() {
  const { id } = useParams();
  const { user, token } = useAuth();
  const [course, setCourse] = useState<any>(null);
  const [labs, setLabs] = useState<any[]>([]);
  const [labSets, setLabSets] = useState<any[]>([]);
  const [homework, setHomework] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [newPost, setNewPost] = useState({ title: "", body: "" });
  const [hwForm, setHwForm] = useState({
    title: "",
    description: "",
    dueAt: "",
    targetClassId: "",
    published: true,
  });
  const [hwDrafts, setHwDrafts] = useState<Record<string, string>>({});
  const [hwSubmissions, setHwSubmissions] = useState<Record<string, any[]>>({});
  const [hwGradeDrafts, setHwGradeDrafts] = useState<Record<string, { score: string; feedback: string }>>({});
  const [hwAiPreview, setHwAiPreview] = useState<
    Record<string, { score: number; feedback: string; source?: string }>
  >({});
  const [hwAiBusy, setHwAiBusy] = useState<Record<string, boolean>>({});
  const [err, setErr] = useState<string | null>(null);
  const [materials, setMaterials] = useState<any[]>([]);

  const canUseQA = useMemo(() => Boolean(token), [token]);

  const isTeacher = useMemo(() => {
    if (!user || !course) return false;
    if (user.role !== "TEACHER" && user.role !== "ADMIN") return false;
    if (user.role === "ADMIN") return true;
    return user.id === course.teacher?.id;
  }, [user, course]);

  /** 课程详情里的 homeworks/labs 字段不全；登录后应以专用接口结果为准，避免 `course.homeworks ?? state` 永远用简略列表 */
  const displayLabs = useMemo(() => {
    if (labs.length > 0) return labs;
    return course?.labs ? course.labs : labs;
  }, [labs, course?.labs]);
  const displayHomework = useMemo(() => {
    if (homework.length > 0) return homework;
    return course?.homeworks ? course.homeworks : homework;
  }, [homework, course?.homeworks]);

  /** 教师：进入课程后自动拉取各作业提交，便于批改与统计 */
  useEffect(() => {
    if (!isTeacher || !token || !id) return;
    let cancelled = false;
    (async () => {
      for (const h of displayHomework) {
        try {
          const { data } = await api.get(`/homework/${h.id}/submissions`);
          if (cancelled) return;
          const list = data.submissions ?? [];
          setHwSubmissions((m) => ({ ...m, [h.id]: list }));
          setHwGradeDrafts((prev) => {
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
          /* ignore */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isTeacher, token, id, displayHomework]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setErr(null);
      try {
        const { data } = await api.get(`/courses/${id}`);
        if (!cancelled) setCourse(data.course);
      } catch {
        if (!cancelled) setErr("课程不存在或无权查看");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token || !id) return;
      try {
        const [l, h, d, ls] = await Promise.all([
          api.get(`/courses/${id}/labs`).catch(() => ({ data: { labs: [] } })),
          api.get(`/courses/${id}/homework`).catch(() => ({ data: { homework: [] } })),
          api.get(`/courses/${id}/discussions`).catch(() => ({ data: { posts: [] } })),
          api.get(`/courses/${id}/lab-sets`).catch(() => ({ data: { labSets: [] } })),
        ]);
        if (!cancelled) {
          setLabs(l.data.labs ?? []);
          setLabSets(ls.data.labSets ?? []);
          const hws = h.data.homework ?? [];
          setHomework(hws);
          setPosts(d.data.posts ?? []);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, token]);

  /** 教学台「作业批改」链接带 #course-homework 时滚到作业区 */
  useEffect(() => {
    if (!course) return;
    if (window.location.hash !== "#course-homework") return;
    requestAnimationFrame(() => {
      document.getElementById("course-homework")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [course, id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token || !id) {
        setMaterials([]);
        return;
      }
      try {
        const { data } = await api.get(`/courses/${id}/materials`);
        if (!cancelled) setMaterials(data.materials ?? []);
      } catch {
        if (!cancelled) setMaterials([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, token]);

  async function refreshSideData() {
    if (!token || !id) return;
    const [l, h, d, c, mat, ls] = await Promise.all([
      api.get(`/courses/${id}/labs`).catch(() => ({ data: { labs: [] } })),
      api.get(`/courses/${id}/homework`).catch(() => ({ data: { homework: [] } })),
      api.get(`/courses/${id}/discussions`).catch(() => ({ data: { posts: [] } })),
      api.get(`/courses/${id}`).catch(() => ({ data: { course: null } })),
      api.get(`/courses/${id}/materials`).catch(() => ({ data: { materials: [] } })),
      api.get(`/courses/${id}/lab-sets`).catch(() => ({ data: { labSets: [] } })),
    ]);
    setLabs(l.data.labs ?? []);
    setLabSets(ls.data.labSets ?? []);
    const hws = h.data.homework ?? [];
    setHomework(hws);
    setPosts(d.data.posts ?? []);
    if (c.data.course) setCourse(c.data.course);
    setMaterials(mat.data.materials ?? []);
  }

  async function enroll() {
    setErr(null);
    try {
      await api.post(`/courses/${id}/enroll`, {});
      window.location.reload();
    } catch (e: unknown) {
      const msg =
        typeof e === "object" && e !== null && "response" in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : null;
      setErr(msg ?? "选课失败（可能需要学生账号，或已选过）");
    }
  }

  if (!course && !err) {
    return (
      <div className="container">
        <div className="muted">加载中…</div>
      </div>
    );
  }

  if (err && !course) {
    return (
      <div className="container">
        <div className="err">{err}</div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="card" style={{ marginTop: 12 }}>
        <div className="spread">
          <div>
            <h1 style={{ margin: "6px 0 8px" }}>{course.title}</h1>
            <div className="muted" style={{ lineHeight: 1.7 }}>
              {course.description ?? "暂无简介"}
            </div>
          </div>
          <div className="grid" style={{ width: 260 }}>
            {user?.role === "STUDENT" || user?.role === "ADMIN" ? (
              <button className="btn primary" type="button" onClick={enroll}>
                选课
              </button>
            ) : null}
            {user?.role === "TEACHER" || user?.role === "ADMIN" ? (
              <>
                <Link className="btn primary" to={`/courses/${id}/manage`}>
                  课程管理
                </Link>
                <Link className="btn" to={`/courses/${id}/gradebook`}>
                  成绩册
                </Link>
              </>
            ) : null}
          </div>
        </div>
        <div className="muted" style={{ marginTop: 12 }}>
          授课教师：{course.teacher?.name}（{course.teacher?.email}）
          {course.category ? ` · 分类：${course.category}` : null}
        </div>
        {(course.startAt || course.endAt) && (
          <div className="muted" style={{ marginTop: 8 }}>
            {course.startAt ? <>开课：{new Date(course.startAt).toLocaleString()} </> : null}
            {course.endAt ? <>· 结课：{new Date(course.endAt).toLocaleString()}</> : null}
          </div>
        )}
      </div>

      {err ? <div className="err" style={{ marginTop: 10 }}>{err}</div> : null}

      <div className="grid" style={{ marginTop: 14, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
        {token ? (
          <div className="card">
            <div style={{ fontWeight: 900 }}>课程资料 / 讲义</div>
            <div className="grid" style={{ marginTop: 10 }}>
              {materials.map((m) => (
                <div key={m.id} className="row spread" style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                  <span style={{ fontWeight: 600 }}>{m.title}</span>
                  <button
                    type="button"
                    className="btn primary"
                    onClick={async () => {
                      const res = await api.get(`/courses/${id}/materials/${m.id}/download`, {
                        responseType: "blob",
                      });
                      const url = URL.createObjectURL(res.data);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = m.fileName;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    下载
                  </button>
                </div>
              ))}
              {materials.length === 0 ? <div className="muted">暂无资料</div> : null}
            </div>
          </div>
        ) : null}

        {course.knowledgeGraphJson ? (
          <div className="card">
            <div style={{ fontWeight: 900 }}>知识图谱（概览）</div>
            <KgPreview json={course.knowledgeGraphJson} />
          </div>
        ) : null}
      </div>

      <div className="grid" style={{ marginTop: 16, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        <div className="card">
          <div style={{ fontWeight: 900 }}>实验</div>
          <div className="muted" style={{ marginTop: 8 }}>
            {isTeacher
              ? "在本区新建实验集、进入实验或管理题目；与下方列表为同一块区域，不再单独重复。"
              : "请先进入「实验」查看截止时间、题目列表与通过情况，再进入单题页面。"}
          </div>
          {isTeacher ? (
            <div className="row" style={{ marginTop: 12, flexWrap: "wrap", gap: 8 }}>
              <button
                type="button"
                className="btn primary"
                onClick={async () => {
                  setErr(null);
                  try {
                    await api.post(`/courses/${id}/lab-sets`, {
                      title: `新实验 ${new Date().toLocaleString()}`,
                    });
                    await refreshSideData();
                  } catch (e2: unknown) {
                    const msg =
                      typeof e2 === "object" && e2 !== null && "response" in e2
                        ? (e2 as { response?: { data?: { error?: string } } }).response?.data?.error
                        : null;
                    setErr(msg ?? "创建实验失败");
                  }
                }}
              >
                新建实验集
              </button>
            </div>
          ) : null}
          <div className="grid" style={{ marginTop: 12 }}>
            {labSets.length > 0
              ? labSets.map((s: any) => (
                  <div
                    key={s.id}
                    className="row spread"
                    style={{ borderTop: "1px solid var(--border)", paddingTop: 12, alignItems: "center" }}
                  >
                    <div>
                      <div style={{ fontWeight: 700 }}>{s.title}</div>
                      <div className="muted" style={{ fontSize: 13 }}>
                        {s.problemCount ?? 0} 道题目
                        {s.dueAt
                          ? ` · 截止 ${new Date(s.dueAt).toLocaleString()}`
                          : " · 未设置截止时间"}
                      </div>
                    </div>
                    <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                      <Link className="btn primary" to={`/courses/${id}/lab-sets/${s.id}`}>
                        进入实验
                      </Link>
                      {isTeacher ? (
                        <>
                          <Link className="btn" to={`/courses/${id}/lab-sets/${s.id}/manage`}>
                            管理
                          </Link>
                          <button
                            type="button"
                            className="btn"
                            style={{ color: "#f85149" }}
                            onClick={async () => {
                              const n = Number(s.problemCount ?? 0);
                              const extra =
                                n > 0
                                  ? `将删除本集下 ${n} 道题及全部测试用例与学生提交，且不可恢复。`
                                  : "将删除本实验集（当前无题目），不可恢复。";
                              if (!confirm(`确定删除实验集「${s.title}」？${extra}`)) return;
                              setErr(null);
                              try {
                                await api.delete(`/courses/${id}/lab-sets/${s.id}`, {
                                  params: n > 0 ? { force: 1 } : {},
                                });
                                await refreshSideData();
                              } catch (e2: unknown) {
                                const msg =
                                  typeof e2 === "object" && e2 !== null && "response" in e2
                                    ? (e2 as { response?: { data?: { error?: string } } }).response?.data?.error
                                    : null;
                                setErr(msg ?? "删除失败");
                              }
                            }}
                          >
                            删除
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                ))
              : displayLabs.map((l: any) => (
                  <div key={l.id} className="row spread" style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{l.title}</div>
                      <div className="muted">{l.language}</div>
                    </div>
                    <Link className="btn primary" to={`/courses/${id}/labs/${l.id}`}>
                      进入实验
                    </Link>
                  </div>
                ))}
            {labSets.length === 0 && displayLabs.length === 0 ? (
              <div className="muted">暂无实验</div>
            ) : null}
          </div>
        </div>

        <div className="card">
          <div style={{ fontWeight: 900 }}>作业</div>
          {isTeacher ? (
            <form
              className="grid"
              style={{ marginTop: 12, paddingBottom: 12, borderBottom: "1px solid var(--border)" }}
              onSubmit={async (e) => {
                e.preventDefault();
                setErr(null);
                try {
                  await api.post(`/courses/${id}/homework`, {
                    title: hwForm.title,
                    description: hwForm.description || undefined,
                    dueAt: hwForm.dueAt ? new Date(hwForm.dueAt).toISOString() : undefined,
                    targetClassId: hwForm.targetClassId || undefined,
                    published: hwForm.published,
                  });
                  setHwForm({ title: "", description: "", dueAt: "", targetClassId: "", published: true });
                  await refreshSideData();
                } catch (e2: unknown) {
                  const msg =
                    typeof e2 === "object" && e2 !== null && "response" in e2
                      ? (e2 as { response?: { data?: { error?: string } } }).response?.data?.error
                      : null;
                  setErr(msg ?? "创建作业失败");
                }
              }}
            >
              <div style={{ fontWeight: 800 }}>新建作业</div>
              <div className="field">
                <label>标题</label>
                <input
                  value={hwForm.title}
                  onChange={(e) => setHwForm({ ...hwForm, title: e.target.value })}
                  required
                />
              </div>
              <div className="field">
                <label>说明</label>
                <textarea
                  rows={3}
                  value={hwForm.description}
                  onChange={(e) => setHwForm({ ...hwForm, description: e.target.value })}
                />
              </div>
              <div className="field">
                <label>截止时间（可选）</label>
                <input
                  type="datetime-local"
                  value={hwForm.dueAt}
                  onChange={(e) => setHwForm({ ...hwForm, dueAt: e.target.value })}
                />
              </div>
              <div className="field">
                <label>指定班级（可选）</label>
                <input
                  value={hwForm.targetClassId}
                  onChange={(e) => setHwForm({ ...hwForm, targetClassId: e.target.value })}
                  placeholder="留空=全课程"
                />
              </div>
              <label className="row">
                <input
                  type="checkbox"
                  checked={hwForm.published}
                  onChange={(e) => setHwForm({ ...hwForm, published: e.target.checked })}
                />
                <span className="muted">创建后立即发布给学生</span>
              </label>
              <button className="btn primary" type="submit">
                创建作业
              </button>
            </form>
          ) : null}
          <div className="grid" style={{ marginTop: 12 }}>
            {displayHomework.map((h: any) => (
              <div key={h.id} style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                <div className="row spread">
                  <div>
                    <div style={{ fontWeight: 700 }}>{h.title}</div>
                    <div className="muted">截止：{h.dueAt ? new Date(h.dueAt).toLocaleString() : "未设置"}</div>
                    <div className="muted">
                      {h.targetClass ? `面向班级：${h.targetClass.name}` : "面向全课程"}
                      {h.published ? " · 已发布" : " · 未发布"}
                    </div>
                  </div>
                  {isTeacher ? (
                    <div className="row">
                      <button
                        className="btn"
                        type="button"
                        onClick={async () => {
                          await api.patch(`/homework/${h.id}/publish`, { published: !h.published });
                          await refreshSideData();
                        }}
                      >
                        {h.published ? "撤回作业" : "发布作业"}
                      </button>
                      <button
                        className="btn primary"
                        type="button"
                        onClick={async () => {
                          await api.patch(`/homework/${h.id}/release-grades`, {});
                          await refreshSideData();
                        }}
                      >
                        发布已批改成绩
                      </button>
                    </div>
                  ) : null}
                </div>

                {user?.role === "STUDENT" || user?.role === "ADMIN" ? (
                  <form
                    className="grid"
                    style={{ marginTop: 10 }}
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setErr(null);
                      try {
                        await api.post(`/homework/${h.id}/submit`, { content: hwDrafts[h.id] ?? "" });
                        await refreshSideData();
                      } catch (e2: unknown) {
                        const msg =
                          typeof e2 === "object" && e2 !== null && "response" in e2
                            ? (e2 as { response?: { data?: { error?: string } } }).response?.data?.error
                            : null;
                        setErr(msg ?? "提交失败（需先选课）");
                      }
                    }}
                  >
                    <textarea
                      rows={4}
                      placeholder="在此填写并提交作业（支持多次修改）"
                      value={hwDrafts[h.id] ?? ""}
                      onChange={(e) => setHwDrafts({ ...hwDrafts, [h.id]: e.target.value })}
                    />
                    <button className="btn primary" type="submit">
                      提交到服务器
                    </button>
                  </form>
                ) : (
                  <div className="muted" style={{ marginTop: 10 }}>
                    学生登录并选课后可在上方提交。
                  </div>
                )}

                {isTeacher ? (
                  <div className="card" style={{ marginTop: 10, boxShadow: "none" }}>
                    <div className="row spread">
                      <div>
                        <div style={{ fontWeight: 700 }}>批改台（教师）</div>
                        <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>
                          AI 建议：可在 backend/.env 指向本机 Ollama（OLLAMA_BASE_URL）免费开源模型，或配置 OPENAI_API_KEY 等云端接口；未配置则仅用本地启发式。分数需教师终审。
                        </div>
                      </div>
                      <button
                        className="btn"
                        type="button"
                        onClick={async () => {
                          const { data } = await api.get(`/homework/${h.id}/submissions`);
                          const list = data.submissions ?? [];
                          setHwSubmissions((m) => ({ ...m, [h.id]: list }));
                          setHwGradeDrafts((prev) => {
                            const next = { ...prev };
                            for (const row of list) {
                              next[row.id] = {
                                score: row.score != null ? String(row.score) : "",
                                feedback: row.feedback ?? "",
                              };
                            }
                            return next;
                          });
                        }}
                      >
                        刷新提交
                      </button>
                    </div>
                    {(() => {
                      const list = hwSubmissions[h.id] ?? [];
                      const graded = list.filter((x: { graded?: boolean }) => x.graded).length;
                      const released = list.filter((x: { released?: boolean }) => x.released).length;
                      const nums = list
                        .filter((x: { graded?: boolean; score?: number | null }) => x.graded && x.score != null)
                        .map((x: { score: number }) => Number(x.score));
                      const avg = nums.length ? nums.reduce((a: number, b: number) => a + b, 0) / nums.length : null;
                      return (
                        <div className="muted" style={{ marginTop: 8, lineHeight: 1.6 }}>
                          提交 {list.length} · 已批改 {graded} · 成绩已发布 {released}
                          {avg != null ? ` · 已批改均分 ${avg.toFixed(1)}` : ""}
                        </div>
                      );
                    })()}
                    <div className="grid" style={{ marginTop: 8 }}>
                      {(hwSubmissions[h.id] ?? []).map((s: any) => (
                        <div key={s.id} style={{ borderTop: "1px solid var(--border)", paddingTop: 8 }}>
                          <div className="muted">
                            {s.user?.name} · {new Date(s.updatedAt).toLocaleString()}
                            <span style={{ marginLeft: 8 }}>
                              {!s.graded ? "· 待批改" : s.released ? "· 成绩已发布给学生" : "· 已批改（待发布）"}
                              {s.graded && s.score != null ? ` · 当前分 ${s.score}` : ""}
                            </span>
                          </div>
                          <div style={{ marginTop: 6, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                            {s.content}
                          </div>
                          <div className="row" style={{ marginTop: 6 }}>
                            <button
                              className="btn"
                              type="button"
                              disabled={hwAiBusy[s.id]}
                              onClick={async () => {
                                setHwAiBusy((m) => ({ ...m, [s.id]: true }));
                                setErr(null);
                                try {
                                  const { data } = await api.post(`/homework/submissions/${s.id}/ai-suggest`, {
                                    apply: false,
                                  });
                                  setHwAiPreview((m) => ({
                                    ...m,
                                    [s.id]: {
                                      ...data.suggestion,
                                      source: data.source as string | undefined,
                                    },
                                  }));
                                } catch (e2: unknown) {
                                  const msg =
                                    typeof e2 === "object" && e2 !== null && "response" in e2
                                      ? (e2 as { response?: { data?: { error?: string } } }).response?.data?.error
                                      : null;
                                  setErr(msg ?? "AI 建议请求失败");
                                } finally {
                                  setHwAiBusy((m) => ({ ...m, [s.id]: false }));
                                }
                              }}
                            >
                              {hwAiBusy[s.id] ? "生成中…" : "AI 建议"}
                            </button>
                            <button
                              className="btn"
                              type="button"
                              disabled={hwAiBusy[s.id]}
                              onClick={async () => {
                                setHwAiBusy((m) => ({ ...m, [s.id]: true }));
                                setErr(null);
                                try {
                                  await api.post(`/homework/submissions/${s.id}/ai-suggest`, {
                                    apply: true,
                                  });
                                  const { data } = await api.get(`/homework/${h.id}/submissions`);
                                  const list = data.submissions ?? [];
                                  setHwSubmissions((m) => ({ ...m, [h.id]: list }));
                                  setHwGradeDrafts((prev) => {
                                    const next = { ...prev };
                                    for (const row of list) {
                                      next[row.id] = {
                                        score: row.score != null ? String(row.score) : "",
                                        feedback: row.feedback ?? "",
                                      };
                                    }
                                    return next;
                                  });
                                  setHwAiPreview((m) => {
                                    const n = { ...m };
                                    delete n[s.id];
                                    return n;
                                  });
                                } catch (e2: unknown) {
                                  const msg =
                                    typeof e2 === "object" && e2 !== null && "response" in e2
                                      ? (e2 as { response?: { data?: { error?: string } } }).response?.data?.error
                                      : null;
                                  setErr(msg ?? "一键应用失败");
                                } finally {
                                  setHwAiBusy((m) => ({ ...m, [s.id]: false }));
                                }
                              }}
                            >
                              一键应用 AI
                            </button>
                          </div>
                          {hwAiPreview[s.id] ? (
                            <div className="muted" style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>
                              <div style={{ fontSize: 12 }}>
                                来源：
                                {hwAiPreview[s.id].source === "heuristic" ? "本地启发式" : "AI 模型"}
                              </div>
                              AI建议分：{hwAiPreview[s.id].score}
                              {"\n"}
                              {hwAiPreview[s.id].feedback}
                            </div>
                          ) : null}
                          <div className="grid" style={{ marginTop: 10 }}>
                            <div className="row" style={{ gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                              <label className="muted">分数（0–100）</label>
                              <input
                                type="number"
                                min={0}
                                max={100}
                                step={1}
                                style={{ width: 96 }}
                                value={hwGradeDrafts[s.id]?.score ?? ""}
                                onChange={(e) =>
                                  setHwGradeDrafts((m) => ({
                                    ...m,
                                    [s.id]: {
                                      score: e.target.value,
                                      feedback: m[s.id]?.feedback ?? s.feedback ?? "",
                                    },
                                  }))
                                }
                              />
                            </div>
                            <textarea
                              rows={3}
                              placeholder="批改反馈（可选）"
                              value={hwGradeDrafts[s.id]?.feedback ?? ""}
                              onChange={(e) =>
                                setHwGradeDrafts((m) => ({
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
                                const raw = hwGradeDrafts[s.id]?.score ?? "";
                                const score = Number(raw);
                                if (!Number.isFinite(score) || score < 0 || score > 100) {
                                  setErr("请输入 0–100 之间的分数");
                                  return;
                                }
                                setErr(null);
                                await api.patch(`/homework/submissions/${s.id}/grade`, {
                                  score,
                                  feedback: (hwGradeDrafts[s.id]?.feedback ?? "").trim() || undefined,
                                });
                                const { data } = await api.get(`/homework/${h.id}/submissions`);
                                const list = data.submissions ?? [];
                                setHwSubmissions((m) => ({ ...m, [h.id]: list }));
                                setHwGradeDrafts((prev) => {
                                  const next = { ...prev };
                                  for (const row of list) {
                                    next[row.id] = {
                                      score: row.score != null ? String(row.score) : "",
                                      feedback: row.feedback ?? "",
                                    };
                                  }
                                  return next;
                                });
                              }}
                            >
                              保存批改
                            </button>
                          </div>
                        </div>
                      ))}
                      {(hwSubmissions[h.id] ?? []).length === 0 ? (
                        <div className="muted">暂无学生提交；若刚选课，请点「刷新提交」。</div>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                <div className="muted" style={{ marginTop: 10, fontSize: 13, lineHeight: 1.6 }}>
                  作业答疑与讨论请统一使用页面下方<strong>「课程问答」</strong>，发帖标题建议注明作业名称「{h.title}」，避免重复专区。
                </div>
              </div>
            ))}
            {displayHomework.length === 0 ? <div className="muted">暂无作业</div> : null}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 900 }}>课程问答</div>
        {!canUseQA ? <div className="muted" style={{ marginTop: 8 }}>登录后可参与讨论。</div> : null}
        {canUseQA ? (
          <form
            className="grid"
            style={{ marginTop: 12 }}
            onSubmit={async (e) => {
              e.preventDefault();
              setErr(null);
              try {
                await api.post(`/courses/${id}/discussions`, newPost);
                setNewPost({ title: "", body: "" });
                const { data } = await api.get(`/courses/${id}/discussions`);
                setPosts(data.posts);
              } catch (e2: unknown) {
                const msg =
                  typeof e2 === "object" && e2 !== null && "response" in e2
                    ? (e2 as { response?: { data?: { error?: string } } }).response?.data?.error
                    : null;
                setErr(msg ?? "发帖失败（可能需要先选课）");
              }
            }}
          >
            <div className="field">
              <label>标题</label>
              <input value={newPost.title} onChange={(e) => setNewPost({ ...newPost, title: e.target.value })} required />
            </div>
            <div className="field">
              <label>内容</label>
              <textarea rows={4} value={newPost.body} onChange={(e) => setNewPost({ ...newPost, body: e.target.value })} required />
            </div>
            <button className="btn primary" type="submit">
              发布
            </button>
          </form>
        ) : null}

        <div className="grid" style={{ marginTop: 16 }}>
          {posts.map((p) => (
            <div key={p.id} style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
              <div style={{ fontWeight: 800 }}>{p.title}</div>
              <div className="muted">
                {p.user.name} · {new Date(p.createdAt).toLocaleString()}
              </div>
              <div style={{ marginTop: 8, lineHeight: 1.7 }}>{p.body}</div>
            </div>
          ))}
          {posts.length === 0 ? <div className="muted">暂无帖子</div> : null}
        </div>
      </div>
    </div>
  );
}
