import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";

export default function CourseDetail() {
  const { id } = useParams();
  const { user, token } = useAuth();
  const [course, setCourse] = useState<any>(null);
  const [labs, setLabs] = useState<any[]>([]);
  const [homework, setHomework] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [newPost, setNewPost] = useState({ title: "", body: "" });
  const [labForm, setLabForm] = useState({
    title: "",
    language: "javascript",
    starterCode: 'console.log("Hello")\n',
    tcIn: "",
    tcExp: "",
  });
  const [hwForm, setHwForm] = useState({ title: "", description: "", dueAt: "" });
  const [hwDrafts, setHwDrafts] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);

  const canUseQA = useMemo(() => Boolean(token), [token]);

  const isTeacher = useMemo(() => {
    if (!user || !course) return false;
    if (user.role !== "TEACHER" && user.role !== "ADMIN") return false;
    if (user.role === "ADMIN") return true;
    return user.id === course.teacher?.id;
  }, [user, course]);

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
        const [l, h, d] = await Promise.all([
          api.get(`/courses/${id}/labs`).catch(() => ({ data: { labs: [] } })),
          api.get(`/courses/${id}/homework`).catch(() => ({ data: { homework: [] } })),
          api.get(`/courses/${id}/discussions`).catch(() => ({ data: { posts: [] } })),
        ]);
        if (!cancelled) {
          setLabs(l.data.labs ?? []);
          setHomework(h.data.homework ?? []);
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

  async function refreshSideData() {
    if (!token || !id) return;
    const [l, h, d, c] = await Promise.all([
      api.get(`/courses/${id}/labs`).catch(() => ({ data: { labs: [] } })),
      api.get(`/courses/${id}/homework`).catch(() => ({ data: { homework: [] } })),
      api.get(`/courses/${id}/discussions`).catch(() => ({ data: { posts: [] } })),
      api.get(`/courses/${id}`).catch(() => ({ data: { course: null } })),
    ]);
    setLabs(l.data.labs ?? []);
    setHomework(h.data.homework ?? []);
    setPosts(d.data.posts ?? []);
    if (c.data.course) setCourse(c.data.course);
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
              <Link className="btn" to={`/courses/${id}/gradebook`}>
                成绩册
              </Link>
            ) : null}
          </div>
        </div>
        <div className="muted" style={{ marginTop: 12 }}>
          授课教师：{course.teacher?.name}（{course.teacher?.email}）
        </div>
      </div>

      {err ? <div className="err" style={{ marginTop: 10 }}>{err}</div> : null}

      {isTeacher ? (
        <div className="card" style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 900 }}>教师：快速创建实验与作业</div>
          <div className="muted" style={{ marginTop: 8, lineHeight: 1.7 }}>
            实验会附赠首条评测用例（可选）。更复杂用例可通过 API `POST /labs/:id/testcases` 追加。
          </div>

          <div className="grid" style={{ marginTop: 12, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
            <form
              className="card grid"
              style={{ boxShadow: "none" }}
              onSubmit={async (e) => {
                e.preventDefault();
                setErr(null);
                try {
                  const { data } = await api.post(`/courses/${id}/labs`, {
                    title: labForm.title,
                    language: labForm.language,
                    starterCode: labForm.starterCode,
                    description: "在课程页快速创建",
                  });
                  const labId = data.lab.id as string;
                  if (labForm.tcIn || labForm.tcExp) {
                    await api.post(`/labs/${labId}/testcases`, {
                      input: labForm.tcIn,
                      expected: labForm.tcExp,
                      hidden: false,
                      weight: 1,
                    });
                  }
                  setLabForm({
                    title: "",
                    language: "javascript",
                    starterCode: 'console.log("Hello")\n',
                    tcIn: "",
                    tcExp: "",
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
              <div style={{ fontWeight: 800 }}>新建实验</div>
              <div className="field">
                <label>标题</label>
                <input
                  value={labForm.title}
                  onChange={(e) => setLabForm({ ...labForm, title: e.target.value })}
                  required
                />
              </div>
              <div className="field">
                <label>语言</label>
                <select
                  value={labForm.language}
                  onChange={(e) =>
                    setLabForm({
                      ...labForm,
                      language: e.target.value as "javascript" | "python",
                    })
                  }
                >
                  <option value="javascript">JavaScript (Node)</option>
                  <option value="python">Python 3</option>
                </select>
              </div>
              <div className="field">
                <label>起始代码</label>
                <textarea
                  rows={5}
                  value={labForm.starterCode}
                  onChange={(e) => setLabForm({ ...labForm, starterCode: e.target.value })}
                />
              </div>
              <div className="field">
                <label>第一条用例输入（stdin）</label>
                <textarea rows={3} value={labForm.tcIn} onChange={(e) => setLabForm({ ...labForm, tcIn: e.target.value })} />
              </div>
              <div className="field">
                <label>第一条用例期望输出（stdout）</label>
                <textarea rows={3} value={labForm.tcExp} onChange={(e) => setLabForm({ ...labForm, tcExp: e.target.value })} />
              </div>
              <button className="btn primary" type="submit">
                创建实验
              </button>
            </form>

            <form
              className="card grid"
              style={{ boxShadow: "none" }}
              onSubmit={async (e) => {
                e.preventDefault();
                setErr(null);
                try {
                  await api.post(`/courses/${id}/homework`, {
                    title: hwForm.title,
                    description: hwForm.description || undefined,
                    dueAt: hwForm.dueAt ? new Date(hwForm.dueAt).toISOString() : undefined,
                  });
                  setHwForm({ title: "", description: "", dueAt: "" });
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
                  rows={4}
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
              <button className="btn primary" type="submit">
                发布作业
              </button>
            </form>
          </div>
        </div>
      ) : null}

      <div className="grid" style={{ marginTop: 16, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        <div className="card">
          <div style={{ fontWeight: 900 }}>实验</div>
          <div className="muted" style={{ marginTop: 8 }}>
            需要先登录并完成选课（学生），或教师从教学台查看。
          </div>
          <div className="grid" style={{ marginTop: 12 }}>
            {(course.labs ?? labs).map((l: any) => (
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
            {(course.labs ?? labs).length === 0 ? <div className="muted">暂无实验</div> : null}
          </div>
        </div>

        <div className="card">
          <div style={{ fontWeight: 900 }}>作业</div>
          <div className="grid" style={{ marginTop: 12 }}>
            {(course.homeworks ?? homework).map((h: any) => (
              <div key={h.id} style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                <div className="row spread">
                  <div>
                    <div style={{ fontWeight: 700 }}>{h.title}</div>
                    <div className="muted">截止：{h.dueAt ? new Date(h.dueAt).toLocaleString() : "未设置"}</div>
                  </div>
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
              </div>
            ))}
            {(course.homeworks ?? homework).length === 0 ? <div className="muted">暂无作业</div> : null}
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
