import { api } from "../../../api/client";
import { useCourse } from "../CourseContext";
import CourseSectionHead from "../CourseSectionHead";

export default function CourseHomework() {
  const {
    courseId,
    isTeacher,
    user,
    displayHomework,
    hwForm,
    setHwForm,
    hwDrafts,
    setHwDrafts,
    hwSubmissions,
    setHwSubmissions,
    hwGradeDrafts,
    setHwGradeDrafts,
    hwAiPreview,
    setHwAiPreview,
    hwAiBusy,
    setHwAiBusy,
    setErr,
    refreshSideData,
  } = useCourse();

  return (
    <div>
      <CourseSectionHead
        title="作业管理"
        description={isTeacher ? "发布作业、批改提交、发布成绩。" : "查看作业要求并提交作答。"}
      />
      <div>
          {isTeacher ? (
            <form
              className="grid"
              style={{ marginTop: 12, paddingBottom: 12, borderBottom: "1px solid var(--border)" }}
              onSubmit={async (e) => {
                e.preventDefault();
                setErr(null);
                try {
                  await api.post(`/courses/${courseId}/homework`, {
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
                  作业答疑请使用左侧导航「课程问答」，发帖标题建议注明作业名称「{h.title}」。
                </div>
              </div>
            ))}
            {displayHomework.length === 0 ? <div className="muted">暂无作业</div> : null}
          </div>
      </div>
    </div>
  );
}

