import { FormEvent, useRef, useState } from "react";
import { api } from "../../../api/client";

export type ImportDraft = {
  type: string;
  stem: string;
  options?: { id: string; text: string }[];
  answer: unknown;
  explanation: string;
  tagPath: string;
  difficulty: string;
  answerSource: "TEACHER" | "AI";
  answerFromDocument?: boolean;
  answerLabel?: string;
};

type Props = {
  courseId: string;
  tags: string[];
  defaultTagPath: string;
  onTagPathChange: (v: string) => void;
  onSaved: () => void;
  onError: (msg: string) => void;
};

export default function PracticeDocumentImport({
  courseId,
  tags,
  defaultTagPath,
  onTagPathChange,
  onSaved,
  onError,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [drafts, setDrafts] = useState<ImportDraft[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleUpload(e: FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      onError("请选择 PDF 或 Word（.docx）文件");
      return;
    }
    if (!defaultTagPath.trim()) {
      onError("请先选择知识点标签");
      return;
    }
    setBusy(true);
    setNotice(null);
    onError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("tagPath", defaultTagPath.trim());
      const { data } = await api.post<{
        drafts: ImportDraft[];
        notice?: string;
      }>(`/courses/${courseId}/practice/import-document`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 180_000,
      });
      setDrafts(
        (data.drafts ?? []).map((d) => ({
          ...d,
          tagPath: defaultTagPath.trim(),
        })),
      );
      setNotice(data.notice ?? (data.drafts?.length ? `识别到 ${data.drafts.length} 道题` : "未识别到题目"));
      if (fileRef.current) fileRef.current.value = "";
    } catch (err: unknown) {
      const msg =
        typeof err === "object" && err !== null && "response" in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : null;
      onError(msg ?? "文档识别失败");
    } finally {
      setBusy(false);
    }
  }

  async function saveDrafts() {
    if (!drafts.length) return;
    setSaveBusy(true);
    onError("");
    try {
      await api.post(`/courses/${courseId}/practice/import-document/save`, {
        questions: drafts.map((d) => ({
          type: d.type,
          stem: d.stem,
          options: d.options,
          answer: d.answer,
          explanation: d.explanation,
          tagPath: d.tagPath,
          difficulty: d.difficulty,
          answerSource: d.answerSource,
          answerConfirmed: d.answerSource === "TEACHER" && d.answerFromDocument,
        })),
      });
      setDrafts([]);
      setNotice(null);
      onSaved();
    } catch (err: unknown) {
      const msg =
        typeof err === "object" && err !== null && "response" in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : null;
      onError(msg ?? "保存失败");
    } finally {
      setSaveBusy(false);
    }
  }

  function updateDraft(index: number, patch: Partial<ImportDraft>) {
    setDrafts((list) => list.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  }

  async function confirmDraft(index: number) {
    const d = drafts[index];
    if (!d) return;
    setSaveBusy(true);
    try {
      await api.post(`/courses/${courseId}/practice/import-document/save`, {
        questions: [
          {
            ...d,
            answerConfirmed: true,
            answerSource: "TEACHER",
          },
        ],
      });
      setDrafts((list) => list.filter((_, i) => i !== index));
      onSaved();
    } catch (err: unknown) {
      const msg =
        typeof err === "object" && err !== null && "response" in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : null;
      onError(msg ?? "确认失败");
    } finally {
      setSaveBusy(false);
    }
  }

  return (
    <div className="card grid practice-doc-import">
      <div style={{ fontWeight: 700 }}>文档识题（AI）</div>
      <label className="field">
        本题集知识点标签
        <select value={defaultTagPath} onChange={(e) => onTagPathChange(e.target.value)} required>
          <option value="">请选择标签</option>
          {tags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <form className="row" onSubmit={(e) => void handleUpload(e)} style={{ gap: 8, flexWrap: "wrap" }}>
        <input ref={fileRef} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" />
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? "AI 识别中…" : "上传并识别"}
        </button>
      </form>
      {notice ? <p className="muted" style={{ margin: 0, fontSize: 13 }}>{notice}</p> : null}

      {drafts.length > 0 ? (
        <>
          <div style={{ fontWeight: 600 }}>识别结果预览（{drafts.length}）</div>
          <div className="practice-doc-import__drafts">
            {drafts.map((d, i) => (
              <DraftCard
                key={i}
                draft={d}
                onChange={(patch) => updateDraft(i, patch)}
                onConfirm={() => void confirmDraft(i)}
                confirmBusy={saveBusy}
              />
            ))}
          </div>
          <button type="button" className="btn primary" disabled={saveBusy} onClick={() => void saveDrafts()}>
            {saveBusy ? "保存中…" : `全部入库（${drafts.length} 题）`}
          </button>
        </>
      ) : null}
    </div>
  );
}

function DraftCard({
  draft,
  onChange,
  onConfirm,
  confirmBusy,
}: {
  draft: ImportDraft;
  onChange: (p: Partial<ImportDraft>) => void;
  onConfirm: () => void;
  confirmBusy: boolean;
}) {
  const aiPending = draft.answerSource === "AI";
  return (
    <div className="practice-bank-item practice-doc-import__draft">
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <span className="practice-badge">{draft.type}</span>
        <span
          className={`practice-badge ${aiPending ? "practice-badge--warn" : "practice-badge--ok"}`}
          title={draft.answerLabel}
        >
          {aiPending ? "AI提供，仅供参考" : "教师/文档提供"}
        </span>
      </div>
      <textarea
        className="field"
        rows={3}
        style={{ width: "100%", marginTop: 8 }}
        value={draft.stem}
        onChange={(e) => onChange({ stem: e.target.value })}
      />
      <label className="field" style={{ marginTop: 8 }}>
        答案（JSON 或选择题填选项 id）
        <textarea
          rows={2}
          style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}
          value={typeof draft.answer === "string" ? draft.answer : JSON.stringify(draft.answer, null, 2)}
          onChange={(e) => {
            try {
              onChange({ answer: JSON.parse(e.target.value), answerSource: "TEACHER", answerFromDocument: true });
            } catch {
              onChange({ answer: e.target.value });
            }
          }}
        />
      </label>
      <label className="field">
        解析
        <textarea rows={2} value={draft.explanation} onChange={(e) => onChange({ explanation: e.target.value })} />
      </label>
      <div className="row" style={{ gap: 8, marginTop: 8 }}>
        <button type="button" className="btn primary" disabled={confirmBusy} onClick={onConfirm}>
          修改并确认为标准答案
        </button>
      </div>
    </div>
  );
}
