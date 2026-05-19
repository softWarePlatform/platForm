import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../../api/client";
import { useCourse } from "../CourseContext";
import CourseSectionHead from "../CourseSectionHead";
import {
  FEEDBACK_TYPE_LABEL,
  PRACTICE_DIFF_LABEL,
  PRACTICE_MODE_LABEL,
  PRACTICE_STATUS_LABEL,
  PRACTICE_TYPE_LABEL,
} from "../practice/practiceLabels";
import "../practice/practice.css";

type Question = {
  id: string;
  type: string;
  stem: string;
  tagPath: string;
  difficulty: string;
  attemptCount?: number;
  correctRate?: number | null;
  options?: { id: string; text: string }[];
  explanation?: string;
};

type PracticeSessionRow = {
  id: string;
  mode: string;
  status: string;
  score?: number | null;
  maxScore: number;
  createdAt: string;
  submittedAt?: string | null;
  itemCount?: number;
  user?: { id: string; name: string; email: string };
};

type FeedbackRow = {
  id: string;
  type: string;
  description: string;
  status: string;
  question: { id: string; stem: string; tagPath: string };
  user: { name: string; email: string };
};

type TeacherTab = "bank" | "feedback" | "sessions";

export default function CoursePractice() {
  const { courseId, isTeacher, err, setErr } = useCourse();
  const navigate = useNavigate();
  const [tab, setTab] = useState<TeacherTab>("bank");
  const [tags, setTags] = useState<string[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [allSessions, setAllSessions] = useState<PracticeSessionRow[]>([]);
  const [mySessions, setMySessions] = useState<PracticeSessionRow[]>([]);
  const [importJson, setImportJson] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [feedbacks, setFeedbacks] = useState<FeedbackRow[]>([]);
  const [tagFilter, setTagFilter] = useState("");
  const [customCount, setCustomCount] = useState(10);
  const [customDiff, setCustomDiff] = useState("MEDIUM");
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    type: "CHOICE",
    stem: "",
    tagPath: "程序设计 > 基础",
    difficulty: "MEDIUM",
    explanation: "",
    options: "a|选项A\nb|选项B\nc|选项C\nd|选项D",
    answer: "b",
    fillAnswer: "",
    shortAnswer: "",
    code: 'print(int(input().split()[0]) + int(input().split()[1]))',
    cases: "3 5|8\n10 20|30",
    language: "python",
  });

  async function reload() {
    const [t, q] = await Promise.all([
      api.get(`/courses/${courseId}/practice/tags`),
      isTeacher
        ? api.get(`/courses/${courseId}/practice/questions`)
        : Promise.resolve({ data: { questions: [] } }),
    ]);
    setTags(t.data.tags ?? []);
    setQuestions(q.data.questions ?? []);

    if (isTeacher) {
      const all = await api
        .get(`/courses/${courseId}/practice/sessions`)
        .catch(() => ({ data: { sessions: [] } }));
      setAllSessions(all.data.sessions ?? []);
      setMySessions([]);
    } else {
      const s = await api
        .get(`/courses/${courseId}/practice/sessions`)
        .catch(() => ({ data: { sessions: [] } }));
      setMySessions(s.data.sessions ?? []);
      setAllSessions([]);
    }
    if (isTeacher) {
      const fb = await api.get(`/courses/${courseId}/practice/feedbacks?status=PENDING`);
      setFeedbacks(fb.data.feedbacks ?? []);
    }
  }

  useEffect(() => {
    reload().catch(() => setErr("加载练习模块失败"));
  }, [courseId, isTeacher]);

  async function startSession(mode: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setErr(null);
    try {
      const { data } = await api.post(`/courses/${courseId}/practice/sessions`, { mode, ...extra });
      navigate(`/courses/${courseId}/practice/session/${data.session.id}`);
    } catch (e: unknown) {
      const msg =
        typeof e === "object" && e !== null && "response" in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : null;
      setErr(msg ?? "无法开始练习");
    } finally {
      setBusy(false);
    }
  }

  function parseOptions(raw: string) {
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [id, ...rest] = line.split("|");
        return { id: id!.trim(), text: rest.join("|").trim() || id!.trim() };
      });
  }

  function buildAnswer() {
    if (form.type === "CHOICE") return { choiceId: form.answer };
    if (form.type === "FILL") return { blanks: [form.fillAnswer] };
    if (form.type === "SHORT_ANSWER") return { text: form.shortAnswer };
    const cases = form.cases
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [input, expected] = l.split("|");
        return { input: `${input}\n`, expected: expected ?? "" };
      });
    return { language: form.language, cases };
  }

  async function createQuestion(e: FormEvent) {
    e.preventDefault();
    if (!form.explanation.trim()) {
      setErr("请填写题目解析（必填）");
      return;
    }
    setErr(null);
    try {
      const options = form.type === "CHOICE" ? parseOptions(form.options) : undefined;
      await api.post(`/courses/${courseId}/practice/questions`, {
        type: form.type,
        stem: form.stem,
        tagPath: form.tagPath,
        difficulty: form.difficulty,
        explanation: form.explanation.trim(),
        options,
        answer: buildAnswer(),
        language: form.type === "CODE" ? form.language : undefined,
      });
      setForm((f) => ({ ...f, stem: "", explanation: "" }));
      await reload();
    } catch (e2: unknown) {
      const msg =
        typeof e2 === "object" && e2 !== null && "response" in e2
          ? (e2 as { response?: { data?: { error?: string } } }).response?.data?.error
          : null;
      setErr(msg ?? "创建失败");
    }
  }

  async function resolveFeedback(id: string, status: "FIXED" | "REJECTED" | "CLOSED", reply: string) {
    await api.patch(`/practice/feedbacks/${id}`, { status, teacherReply: reply });
    await reload();
  }

  async function importQuestions() {
    setErr(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(importJson);
    } catch {
      setErr("导入内容不是合法 JSON");
      return;
    }
    const questions = Array.isArray(parsed)
      ? parsed
      : (parsed as { questions?: unknown })?.questions;
    if (!Array.isArray(questions) || questions.length === 0) {
      setErr("请使用题目数组，或 { \"questions\": [ ... ] } 格式");
      return;
    }
    setImportBusy(true);
    try {
      const { data } = await api.post<{ imported: number }>(
        `/courses/${courseId}/practice/questions/import`,
        { questions },
      );
      setImportJson("");
      alert(`成功导入 ${data.imported} 道题目`);
      await reload();
    } catch (e: unknown) {
      const msg =
        typeof e === "object" && e !== null && "response" in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : null;
      setErr(msg ?? "导入失败");
    } finally {
      setImportBusy(false);
    }
  }

  async function deleteSession(sessionId: string) {
    if (!confirm("确定删除该练习记录吗？删除后不可恢复。")) return;
    setErr(null);
    try {
      await api.delete(`/practice/sessions/${sessionId}`);
      await reload();
    } catch (e: unknown) {
      const msg =
        typeof e === "object" && e !== null && "response" in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : null;
      setErr(msg ?? "删除失败");
    }
  }

  return (
    <div className="practice-page">
      <CourseSectionHead
        title="练习"
        description={
          isTeacher
            ? "出题、批量导入题目；查看学生练习记录与题目反馈。"
            : "智能组卷、按知识点练习、错题本与自定义练习；仅可查看本人的练习记录。"
        }
      />
      {err ? <div className="err" style={{ marginTop: 12 }}>{err}</div> : null}

      {isTeacher ? (
        <div className="practice-tabs">
          <button type="button" className={`btn ${tab === "bank" ? "primary" : ""}`} onClick={() => setTab("bank")}>
            题库管理
          </button>
          <button
            type="button"
            className={`btn ${tab === "sessions" ? "primary" : ""}`}
            onClick={() => setTab("sessions")}
          >
            学生练习记录
          </button>
          <button
            type="button"
            className={`btn ${tab === "feedback" ? "primary" : ""}`}
            onClick={() => setTab("feedback")}
          >
            反馈待处理 ({feedbacks.length})
          </button>
        </div>
      ) : null}

      {!isTeacher ? (
        <StudentPracticePanel
          {...{
            tags,
            tagFilter,
            setTagFilter,
            customCount,
            setCustomCount,
            customDiff,
            setCustomDiff,
            busy,
            startSession,
            sessions: mySessions,
            courseId,
            onDeleteSession: deleteSession,
          }}
        />
      ) : null}

      {isTeacher && tab === "sessions" && (
        <div className="practice-panel">
          <h3 className="practice-panel__title">全班练习记录（共 {allSessions.length} 条）</h3>
          <SessionTable
            sessions={allSessions}
            courseId={courseId}
            showStudent
            onDelete={(id) => void deleteSession(id)}
          />
        </div>
      )}

      {isTeacher && tab === "bank" && (
        <div className="grid" style={{ marginTop: 16, gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div className="grid" style={{ gap: 16 }}>
          <form className="card grid" onSubmit={createQuestion}>
            <div style={{ fontWeight: 700 }}>手动出题</div>
            <label className="field">
              题型
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="CHOICE">选择题</option>
                <option value="FILL">填空题</option>
                <option value="SHORT_ANSWER">简答题</option>
                <option value="CODE">编程题</option>
              </select>
            </label>
            <label className="field">
              知识点标签（多级用 &gt; 分隔）
              <input value={form.tagPath} onChange={(e) => setForm({ ...form, tagPath: e.target.value })} />
            </label>
            <label className="field">
              难度
              <select value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}>
                <option value="EASY">简单</option>
                <option value="MEDIUM">中等</option>
                <option value="HARD">困难</option>
              </select>
            </label>
            <label className="field">
              题干
              <textarea rows={4} value={form.stem} onChange={(e) => setForm({ ...form, stem: e.target.value })} required />
            </label>
            {form.type === "CHOICE" ? (
              <>
                <label className="field">
                  选项（每行：id|文本）
                  <textarea rows={4} value={form.options} onChange={(e) => setForm({ ...form, options: e.target.value })} />
                </label>
                <label className="field">
                  正确选项 id
                  <input value={form.answer} onChange={(e) => setForm({ ...form, answer: e.target.value })} />
                </label>
              </>
            ) : null}
            {form.type === "FILL" ? (
              <label className="field">
                填空答案
                <input value={form.fillAnswer} onChange={(e) => setForm({ ...form, fillAnswer: e.target.value })} />
              </label>
            ) : null}
            {form.type === "SHORT_ANSWER" ? (
              <label className="field">
                参考答案
                <textarea rows={2} value={form.shortAnswer} onChange={(e) => setForm({ ...form, shortAnswer: e.target.value })} />
              </label>
            ) : null}
            {form.type === "CODE" ? (
              <>
                <label className="field">
                  语言
                  <select value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })}>
                    <option value="python">python</option>
                    <option value="javascript">javascript</option>
                  </select>
                </label>
                <label className="field">
                  测试用例（每行：输入|期望输出）
                  <textarea rows={3} value={form.cases} onChange={(e) => setForm({ ...form, cases: e.target.value })} />
                </label>
                <label className="field">
                  参考代码
                  <textarea rows={4} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
                </label>
              </>
            ) : null}
            <label className="field">
              题目解析（必填，提交后对学生展示）
              <textarea
                rows={3}
                value={form.explanation}
                onChange={(e) => setForm({ ...form, explanation: e.target.value })}
                required
                placeholder="说明解题思路、常见错误与知识点…"
              />
            </label>
            <button type="submit" className="btn primary">
              保存题目
            </button>
          </form>

          <div className="card grid">
            <div style={{ fontWeight: 700 }}>批量导入（JSON）</div>
            <p className="muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
              提交格式：<code>{`{ "questions": [ ... ] }`}</code> 或直接题目数组。每题需含 type、stem、tagPath、answer、explanation
              等字段，单次最多 200 题。
            </p>
            <label className="field">
              JSON 内容
              <textarea
                rows={10}
                value={importJson}
                onChange={(e) => setImportJson(e.target.value)}
                placeholder={`{\n  "questions": [\n    {\n      "type": "CHOICE",\n      "stem": "题干",\n      "tagPath": "程序设计 > 基础",\n      "difficulty": "EASY",\n      "explanation": "解析文字",\n      "options": [{ "id": "a", "text": "A" }, { "id": "b", "text": "B" }],\n      "answer": { "choiceId": "b" }\n    }\n  ]\n}`}
                style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}
              />
            </label>
            <button
              type="button"
              className="btn primary"
              disabled={importBusy || !importJson.trim()}
              onClick={() => void importQuestions()}
            >
              {importBusy ? "导入中…" : "导入题目"}
            </button>
          </div>
          </div>

          <div className="card">
            <div style={{ fontWeight: 700 }}>题库列表（{questions.length}）</div>
            <div style={{ marginTop: 10, maxHeight: 560, overflow: "auto" }}>
              {questions.map((q) => (
                <div key={q.id} className="practice-bank-item">
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    <span className="practice-badge practice-badge--type">
                      {PRACTICE_TYPE_LABEL[q.type] ?? q.type}
                    </span>
                    <span className={`practice-badge practice-badge--${q.difficulty.toLowerCase()}`}>
                      {PRACTICE_DIFF_LABEL[q.difficulty] ?? q.difficulty}
                    </span>
                  </div>
                  <div style={{ marginTop: 8, fontWeight: 600 }}>{q.stem?.slice(0, 160)}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    {q.tagPath} · 作答 {q.attemptCount ?? 0} 次
                    {q.correctRate != null ? ` · 正确率 ${Math.round(q.correctRate * 100)}%` : ""}
                  </div>
                  {q.explanation ? (
                    <div className="practice-bank-item__explain">
                      <strong>解析：</strong>
                      {q.explanation.slice(0, 200)}
                      {q.explanation.length > 200 ? "…" : ""}
                    </div>
                  ) : (
                    <div className="practice-bank-item__explain" style={{ color: "#b91c1c" }}>
                      缺少解析
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {isTeacher && tab === "feedback" && (
        <div className="grid" style={{ marginTop: 16, gap: 12 }}>
          {feedbacks.length === 0 ? <p className="muted">暂无待处理反馈</p> : null}
          {feedbacks.map((f) => (
            <FeedbackCard key={f.id} row={f} onResolve={resolveFeedback} />
          ))}
        </div>
      )}
    </div>
  );
}

function StudentPracticePanel(props: {
  tags: string[];
  tagFilter: string;
  setTagFilter: (v: string) => void;
  customCount: number;
  setCustomCount: (n: number) => void;
  customDiff: string;
  setCustomDiff: (v: string) => void;
  busy: boolean;
  startSession: (mode: string, extra?: Record<string, unknown>) => void;
  sessions: PracticeSessionRow[];
  courseId: string;
  onDeleteSession: (sessionId: string) => void | Promise<void>;
}) {
  const {
    tags,
    tagFilter,
    setTagFilter,
    customCount,
    setCustomCount,
    customDiff,
    setCustomDiff,
    busy,
    startSession,
    sessions,
    courseId,
    onDeleteSession,
  } = props;

  return (
    <div>
      <div className="practice-mode-grid">
        <button type="button" className="practice-mode-card" disabled={busy} onClick={() => startSession("SMART")}>
          <p className="practice-mode-card__title">智能组卷</p>
          <p className="practice-mode-card__desc">约 10 道题，根据历史错题优先覆盖薄弱知识点。</p>
        </button>
        <button
          type="button"
          className="practice-mode-card"
          disabled={busy || !tagFilter}
          onClick={() => startSession("BY_TAG", { tagPath: tagFilter, count: 10 })}
        >
          <p className="practice-mode-card__title">按知识点练习</p>
          <p className="practice-mode-card__desc">在下方选择知识点标签后开始，每次约 10 题。</p>
        </button>
        <button type="button" className="practice-mode-card" disabled={busy} onClick={() => startSession("WRONG_BOOK", { count: 10 })}>
          <p className="practice-mode-card__title">错题练习</p>
          <p className="practice-mode-card__desc">从个人错题本抽取题目，巩固易错点。</p>
        </button>
      </div>

      <div className="practice-panel">
        <h3 className="practice-panel__title">选择知识点（按知识点 / 自定义练习可选）</h3>
        <label className="field" style={{ maxWidth: 480 }}>
          知识点标签
          <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
            <option value="">请选择知识点</option>
            {tags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="practice-panel">
        <h3 className="practice-panel__title">自定义练习</h3>
        <div className="row" style={{ gap: 16, flexWrap: "wrap" }}>
          <label className="field">
            题量
            <select value={customCount} onChange={(e) => setCustomCount(Number(e.target.value))}>
              {[5, 10, 20].map((n) => (
                <option key={n} value={n}>
                  {n} 题
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            难度
            <select value={customDiff} onChange={(e) => setCustomDiff(e.target.value)}>
              <option value="EASY">简单</option>
              <option value="MEDIUM">中等</option>
              <option value="HARD">困难</option>
            </select>
          </label>
          <label className="field" style={{ minWidth: 220 }}>
            知识点范围（可选）
            <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
              <option value="">不限</option>
              {tags.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn primary"
            style={{ alignSelf: "flex-end" }}
            disabled={busy}
            onClick={() =>
              startSession("CUSTOM", {
                count: customCount,
                difficulty: customDiff,
                tagPrefix: tagFilter || undefined,
              })
            }
          >
            开始自定义练习
          </button>
        </div>
      </div>

      <div className="practice-panel">
        <h3 className="practice-panel__title">我的练习记录</h3>
        <SessionTable
          sessions={sessions}
          courseId={courseId}
          showStudent={false}
          onDelete={(id) => void onDeleteSession(id)}
        />
      </div>
    </div>
  );
}

function SessionTable({
  sessions,
  courseId,
  showStudent,
  onDelete,
}: {
  sessions: PracticeSessionRow[];
  courseId: string;
  showStudent: boolean;
  onDelete: (sessionId: string) => void;
}) {
  if (!sessions.length) {
    return <p className="muted" style={{ marginTop: 8 }}>暂无练习记录</p>;
  }

  return (
    <div style={{ overflowX: "auto", marginTop: 8 }}>
      <table className="practice-session-table">
        <thead>
          <tr>
            {showStudent ? <th>学生</th> : null}
            <th>方式</th>
            <th>状态</th>
            <th>得分</th>
            <th>题量</th>
            <th>时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => (
            <tr key={s.id}>
              {showStudent ? (
                <td>
                  <div style={{ fontWeight: 600 }}>{s.user?.name ?? "—"}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {s.user?.email}
                  </div>
                </td>
              ) : null}
              <td>{PRACTICE_MODE_LABEL[s.mode] ?? s.mode}</td>
              <td>
                <span
                  className={`practice-badge ${
                    s.status === "GRADED"
                      ? "practice-badge--ok"
                      : s.status === "IN_PROGRESS"
                        ? "practice-badge--progress"
                        : ""
                  }`}
                >
                  {PRACTICE_STATUS_LABEL[s.status] ?? s.status}
                </span>
              </td>
              <td>
                {s.status === "GRADED" && s.score != null ? `${s.score} / ${s.maxScore}` : "—"}
              </td>
              <td>{s.itemCount ?? "—"}</td>
              <td className="muted" style={{ fontSize: 13 }}>
                {new Date(s.createdAt).toLocaleString()}
              </td>
              <td>
                <div className="row" style={{ gap: 10 }}>
                  <Link to={`/courses/${courseId}/practice/session/${s.id}`}>查看</Link>
                  <button
                    type="button"
                    className="btn"
                    style={{ padding: "4px 10px", fontSize: 13, color: "var(--danger)" }}
                    onClick={() => onDelete(s.id)}
                  >
                    删除
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FeedbackCard({
  row,
  onResolve,
}: {
  row: FeedbackRow;
  onResolve: (id: string, status: "FIXED" | "REJECTED" | "CLOSED", reply: string) => void;
}) {
  const [reply, setReply] = useState("");
  return (
    <div className="card">
      <div className="muted" style={{ fontSize: 12 }}>
        {row.user.name} · {FEEDBACK_TYPE_LABEL[row.type] ?? row.type}
      </div>
      <div style={{ marginTop: 6 }}>{row.question.stem.slice(0, 120)}</div>
      <p style={{ marginTop: 8, lineHeight: 1.6 }}>{row.description}</p>
      <textarea rows={2} className="field" style={{ width: "100%", marginTop: 8 }} value={reply} onChange={(e) => setReply(e.target.value)} />
      <div className="row" style={{ marginTop: 8, gap: 8 }}>
        <button type="button" className="btn primary" onClick={() => onResolve(row.id, "FIXED", reply)}>
          已修正
        </button>
        <button type="button" className="btn" onClick={() => onResolve(row.id, "CLOSED", reply || "题目无误")}>
          关闭
        </button>
        <button type="button" className="btn" onClick={() => onResolve(row.id, "REJECTED", reply)}>
          驳回
        </button>
      </div>
    </div>
  );
}
