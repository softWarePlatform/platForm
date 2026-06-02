import { FormEvent, useState } from "react";
import { api } from "../../../api/client";
import { PRACTICE_TYPE_LABEL } from "./practiceLabels";

export type TeacherQuestion = {
  id: string;
  type: string;
  stem: string;
  tagPath: string;
  difficulty: string;
  options?: { id: string; text: string }[];
  answer?: unknown;
  explanation?: string;
  answerSource?: "TEACHER" | "AI";
  answerConfirmed?: boolean;
  answerLabel?: string | null;
};

type Props = {
  courseId: string;
  question: TeacherQuestion;
  onClose: () => void;
  onSaved: () => void;
};

export default function TeacherQuestionEditor({ question, onClose, onSaved }: Props) {
  const [stem, setStem] = useState(question.stem);
  const [explanation, setExplanation] = useState(question.explanation ?? "");
  const [answerText, setAnswerText] = useState(JSON.stringify(question.answer ?? {}, null, 2));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save(confirmed: boolean) {
    setBusy(true);
    setErr(null);
    let answer: unknown;
    try {
      answer = JSON.parse(answerText);
    } catch {
      setErr("答案须为合法 JSON");
      setBusy(false);
      return;
    }
    try {
      if (confirmed) {
        await api.post(`/practice/questions/${question.id}/confirm-answer`, {
          answer,
          explanation: explanation.trim() || undefined,
        });
      } else {
        await api.patch(`/practice/questions/${question.id}`, {
          stem,
          answer,
          explanation: explanation.trim() || undefined,
        });
      }
      onSaved();
      onClose();
    } catch (e: unknown) {
      const msg =
        typeof e === "object" && e !== null && "response" in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : null;
      setErr(msg ?? "保存失败");
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void save(false);
  }

  const aiPending = question.answerSource === "AI" && !question.answerConfirmed;

  return (
    <div className="practice-modal-backdrop" onClick={onClose}>
      <form className="card practice-modal" onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontWeight: 700 }}>
          编辑题目 · {PRACTICE_TYPE_LABEL[question.type] ?? question.type}
        </div>
        {aiPending ? (
          <p className="practice-ai-notice">AI提供，仅供参考 — 修改后请点击「确认为标准答案」</p>
        ) : (
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            {question.answerLabel ?? "教师提供"}
          </p>
        )}
        {err ? <div className="err">{err}</div> : null}
        <label className="field">
          题干
          <textarea rows={4} value={stem} onChange={(e) => setStem(e.target.value)} required />
        </label>
        <label className="field">
          答案（JSON）
          <textarea
            rows={4}
            style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}
            value={answerText}
            onChange={(e) => setAnswerText(e.target.value)}
          />
        </label>
        <label className="field">
          解析
          <textarea rows={3} value={explanation} onChange={(e) => setExplanation(e.target.value)} />
        </label>
        <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <button type="submit" className="btn" disabled={busy}>
            保存修改
          </button>
          <button type="button" className="btn primary" disabled={busy} onClick={() => void save(true)}>
            确认为标准答案
          </button>
          <button type="button" className="btn" onClick={onClose}>
            取消
          </button>
        </div>
      </form>
    </div>
  );
}
