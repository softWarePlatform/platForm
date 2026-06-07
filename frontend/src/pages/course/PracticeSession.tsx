import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Editor from "@monaco-editor/react";
import { api } from "../../api/client";
import { useConfirm } from "../../components/ui/ConfirmDialog";
import { useToast } from "../../components/ui/Toast";
import CourseSectionHead from "./CourseSectionHead";
import { formatCorrectAnswer, formatResultDetail } from "./practice/practiceFormat";
import {
  PRACTICE_DIFF_LABEL,
  PRACTICE_STATUS_LABEL,
  PRACTICE_TYPE_LABEL,
  FEEDBACK_TYPE_LABEL,
} from "./practice/practiceLabels";
import PracticeTutorChat, { type TutorTurn } from "./practice/PracticeTutorChat";
import "./practice/practice.css";

type SessionItem = {
  id: string;
  orderIndex: number;
  answerJson: unknown;
  correct?: boolean;
  score?: number;
  maxScore?: number;
  resultJson?: unknown;
  explanation?: string;
  answer?: unknown;
  tutorMessages?: TutorTurn[];
  question: {
    id: string;
    type: string;
    stem: string;
    options?: { id: string; text: string }[] | null;
    tagPath: string;
    difficulty: string;
    language?: string | null;
    explanation?: string;
  };
};

const FEEDBACK_TYPES = Object.entries(FEEDBACK_TYPE_LABEL).map(([value, label]) => ({ value, label }));

export default function PracticeSession() {
  const { courseId = "", sessionId = "" } = useParams();
  const navigate = useNavigate();
  const { confirm } = useConfirm();
  const { success } = useToast();
  const [session, setSession] = useState<{
    id: string;
    status: string;
    score?: number;
    maxScore: number;
    items: SessionItem[];
  } | null>(null);
  const [idx, setIdx] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [similar, setSimilar] = useState<{ id: string; stem: string; tagPath: string }[]>([]);
  const [fbType, setFbType] = useState("UNCLEAR");
  const [fbDesc, setFbDesc] = useState("");
  const [submitTip, setSubmitTip] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await api.get(`/practice/sessions/${sessionId}`);
    setSession(data.session);
  }, [sessionId]);

  useEffect(() => {
    load().catch(() => setErr("加载练习失败"));
  }, [load]);

  const item = session?.items[idx];
  const graded = session?.status === "GRADED";
  const q = item?.question;
  const ans = item?.answerJson;
  const explanation =
    item?.explanation?.trim() || item?.question.explanation?.trim() || "";

  async function saveAnswer(answer: unknown) {
    if (!item || graded) return;
    await api.patch(`/practice/sessions/${sessionId}/items/${item.id}`, {
      answer,
      timeSpentMs: 30_000,
    });
    setSession((s) => {
      if (!s) return s;
      const items = [...s.items];
      items[idx] = { ...items[idx]!, answerJson: answer };
      return { ...s, items };
    });
  }

  async function deleteRecord() {
    const ok = await confirm({
      title: "删除练习记录",
      message: "确定删除该练习记录吗？删除后不可恢复。",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    setErr(null);
    try {
      await api.delete(`/practice/sessions/${sessionId}`);
      navigate(`/courses/${courseId}/practice`);
    } catch (e: unknown) {
      const msg =
        typeof e === "object" && e !== null && "response" in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : null;
      setErr(msg ?? "删除失败");
    } finally {
      setBusy(false);
    }
  }

  async function submitAll() {
    setBusy(true);
    setErr(null);
    setSubmitTip(null);
    try {
      const { data } = await api.post<{ removedFromWrongBook?: number }>(
        `/practice/sessions/${sessionId}/submit`,
      );
      if (data.removedFromWrongBook && data.removedFromWrongBook > 0) {
        setSubmitTip(`已答对 ${data.removedFromWrongBook} 道题，已从错题本移除。`);
      }
      await load();
    } catch (e: unknown) {
      const msg =
        typeof e === "object" && e !== null && "response" in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : null;
      setErr(msg ?? "提交失败");
    } finally {
      setBusy(false);
    }
  }

  async function loadSimilar() {
    if (!item) return;
    const { data } = await api.get(`/practice/questions/${item.question.id}/similar`);
    setSimilar(data.similar ?? []);
  }

  async function sendFeedback() {
    if (!item || !fbDesc.trim()) return;
    await api.post(`/practice/questions/${item.question.id}/feedback`, {
      type: fbType,
      description: fbDesc.trim(),
    });
    setFbDesc("");
    success("反馈已提交");
  }

  function goToQuestion(i: number) {
    setIdx(i);
    setSimilar([]);
  }

  return (
    <div className="practice-page">
      <Link className="muted" to={`/courses/${courseId}/practice`} style={{ fontSize: 13 }}>
        ← 返回练习
      </Link>

      <CourseSectionHead title={graded ? "练习结果" : "进行练习"} />

      {graded && session ? (
        <p className="practice-score-summary" style={{ marginTop: 12 }}>
          {session.score ?? 0}
          <span>/ {session.maxScore} 分 · {PRACTICE_STATUS_LABEL[session.status] ?? session.status}</span>
        </p>
      ) : null}

      {err ? (
        <div className="err" style={{ marginTop: 12 }}>
          {err}
        </div>
      ) : null}
      {submitTip ? (
        <div
          className="practice-graded-banner practice-graded-banner--ok"
          style={{ marginTop: 12 }}
        >
          {submitTip}
        </div>
      ) : null}
      {!session ? <p className="muted" style={{ marginTop: 16 }}>加载中…</p> : null}

      {session && q && item ? (
        <div className="practice-session-layout">
          {session.items.length > 1 ? (
            <nav className="practice-q-nav" aria-label="题目列表">
              <p className="practice-q-nav__title">题目导航</p>
              {session.items.map((it, i) => {
                const answered = it.answerJson != null && String(it.answerJson) !== "";
                let dotClass = "practice-q-nav__dot";
                if (graded) {
                  dotClass += it.correct ? " practice-q-nav__dot--ok" : " practice-q-nav__dot--fail";
                } else if (answered) {
                  dotClass += " practice-q-nav__dot--ok";
                } else {
                  dotClass += " practice-q-nav__dot--empty";
                }
                return (
                  <button
                    key={it.id}
                    type="button"
                    className={`practice-q-nav__btn ${i === idx ? "is-active" : ""}`}
                    onClick={() => goToQuestion(i)}
                  >
                    <span className={dotClass} />
                    第 {i + 1} 题
                  </button>
                );
              })}
            </nav>
          ) : (
            <div />
          )}

          <div>
            <article className="practice-question-card">
              <div className="practice-question-card__meta">
                <span className="practice-badge practice-badge--type">
                  {PRACTICE_TYPE_LABEL[q.type] ?? q.type}
                </span>
                <span
                  className={`practice-badge practice-badge--${q.difficulty.toLowerCase()}`}
                >
                  {PRACTICE_DIFF_LABEL[q.difficulty] ?? q.difficulty}
                </span>
                <span className="practice-badge">{q.tagPath}</span>
              </div>

              <p className="practice-question-card__stem">{q.stem}</p>

              {q.type === "CHOICE" && q.options ? (
                <div className="practice-choice-list">
                  {q.options.map((opt) => {
                    const selected = ans === opt.id;
                    const correctId =
                      graded && item.answer
                        ? String((item.answer as { choiceId?: string }).choiceId ?? "")
                        : null;
                    let cls = "practice-choice";
                    if (selected) cls += " is-selected";
                    if (graded && correctId === opt.id) cls += " is-correct";
                    if (graded && selected && correctId !== opt.id) cls += " is-wrong";
                    return (
                      <label key={opt.id} className={cls}>
                        <input
                          type="radio"
                          name={`choice-${item.id}`}
                          checked={selected}
                          disabled={graded}
                          onChange={() => saveAnswer(opt.id)}
                        />
                        <span>
                          <strong>{opt.id}.</strong> {opt.text}
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : null}

              {q.type === "FILL" ? (
                <input
                  className="field"
                  style={{ width: "100%" }}
                  disabled={graded}
                  value={typeof ans === "string" ? ans : ""}
                  onChange={(e) => saveAnswer(e.target.value)}
                  placeholder="在此填写答案"
                />
              ) : null}

              {q.type === "SHORT_ANSWER" ? (
                <textarea
                  rows={5}
                  className="field"
                  style={{ width: "100%" }}
                  disabled={graded}
                  value={typeof ans === "string" ? ans : ""}
                  onChange={(e) => saveAnswer(e.target.value)}
                  placeholder="在此作答（简答）"
                />
              ) : null}

              {q.type === "CODE" ? (
                <div
                  style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}
                >
                  <Editor
                    height="280px"
                    language={q.language === "javascript" ? "javascript" : "python"}
                    value={typeof ans === "string" ? ans : ""}
                    onChange={(v) => {
                      if (!graded) saveAnswer(v ?? "");
                    }}
                    options={{ readOnly: graded, minimap: { enabled: false }, fontSize: 14 }}
                  />
                </div>
              ) : null}

              {graded ? (
                <GradedSections item={item} explanation={explanation} />
              ) : null}

              {!graded ? (
                <div className="practice-subsection">
                  <p className="practice-subsection__title">AI 辅导（多轮对话，不直接给出答案）</p>
                  <PracticeTutorChat
                    sessionId={sessionId}
                    itemId={item.id}
                    initialMessages={item.tutorMessages ?? []}
                    onMessagesChange={(messages) => {
                      setSession((s) => {
                        if (!s) return s;
                        const items = [...s.items];
                        items[idx] = { ...items[idx]!, tutorMessages: messages };
                        return { ...s, items };
                      });
                    }}
                  />
                  <button
                    type="button"
                    className="btn"
                    style={{ marginTop: 12 }}
                    onClick={() => void loadSimilar()}
                  >
                    相似题推荐
                  </button>
                </div>
              ) : null}

              {similar.length ? (
                <div className="practice-subsection">
                  <p className="practice-subsection__title">相似题</p>
                  <ul className="practice-hint-list">
                    {similar.map((s) => (
                      <li key={s.id}>
                        <span className="muted" style={{ fontSize: 12 }}>
                          {s.tagPath}
                        </span>
                        <div>{s.stem}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {!graded ? (
                <div className="practice-subsection">
                  <p className="practice-subsection__title">题目反馈</p>
                  <select
                    value={fbType}
                    onChange={(e) => setFbType(e.target.value)}
                    className="field"
                    style={{ maxWidth: 280 }}
                  >
                    {FEEDBACK_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <textarea
                    rows={3}
                    className="field"
                    style={{ width: "100%", marginTop: 10 }}
                    value={fbDesc}
                    onChange={(e) => setFbDesc(e.target.value)}
                    placeholder="描述问题或建议…"
                  />
                  <button type="button" className="btn" style={{ marginTop: 10 }} onClick={sendFeedback}>
                    提交反馈
                  </button>
                </div>
              ) : null}
            </article>

            <div className="practice-actions-bar">
              {!graded ? (
                <>
                  {idx > 0 ? (
                    <button type="button" className="btn" onClick={() => goToQuestion(idx - 1)}>
                      上一题
                    </button>
                  ) : null}
                  {idx < session.items.length - 1 ? (
                    <button type="button" className="btn primary" onClick={() => goToQuestion(idx + 1)}>
                      下一题
                    </button>
                  ) : (
                    <button type="button" className="btn primary" disabled={busy} onClick={submitAll}>
                      {busy ? "提交中…" : "提交整份练习"}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn"
                    style={{ color: "var(--danger)" }}
                    disabled={busy}
                    onClick={deleteRecord}
                  >
                    删除记录
                  </button>
                </>
              ) : (
                <>
                  {idx > 0 ? (
                    <button type="button" className="btn" onClick={() => goToQuestion(idx - 1)}>
                      上一题
                    </button>
                  ) : null}
                  {idx < session.items.length - 1 ? (
                    <button type="button" className="btn" onClick={() => goToQuestion(idx + 1)}>
                      下一题
                    </button>
                  ) : null}
                  <Link className="btn primary" to={`/courses/${courseId}/practice`}>
                    返回练习首页
                  </Link>
                  <button
                    type="button"
                    className="btn"
                    style={{ color: "var(--danger)" }}
                    disabled={busy}
                    onClick={deleteRecord}
                  >
                    删除记录
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function GradedSections({
  item,
  explanation,
}: {
  item: SessionItem;
  explanation: string;
}) {
  const ok = item.correct;
  const q = item.question;
  const correctText = item.answer
    ? formatCorrectAnswer(q.type, item.answer, q.options)
    : "—";
  const detailText = formatResultDetail(q.type, item.resultJson);

  return (
    <>
      <div
        className={`practice-graded-banner ${ok ? "practice-graded-banner--ok" : "practice-graded-banner--fail"}`}
      >
        {ok ? "回答正确" : "回答错误"} · 本题得分 {item.score ?? 0} / {item.maxScore ?? 1}
      </div>

      <div className="practice-answer-box">
        <h4>参考答案</h4>
        <p>{correctText}</p>
      </div>

      <div className="practice-explain-box">
        <h4>题目解析</h4>
        <p>{explanation || "暂无解析内容。"}</p>
      </div>

      {detailText ? (
        <div className="practice-detail-box">
          <strong style={{ display: "block", marginBottom: 6 }}>评测详情</strong>
          {detailText}
        </div>
      ) : null}
    </>
  );
}
