import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { api } from "../../api/client";

type AiAttachment = { id: string; fileName: string };

type Props = {
  labId: string;
  /** 从提交页跳转时自动发起分析 */
  autoAnalyzeSubmissionId?: string | null;
  onAutoAnalyzeDone?: () => void;
};

const ANALYZE_PROMPT =
  "请根据我的本次提交与评测结果，分析错误原因、可疑代码位置，并给出修改建议。";

function buildAiBody(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  submissionId: string | null,
  attachmentIds: string[],
) {
  return {
    messages,
    ...(submissionId ? { submissionId } : {}),
    ...(attachmentIds.length > 0 ? { attachmentIds } : {}),
  };
}

export default function LabAiPanel({
  labId,
  autoAnalyzeSubmissionId,
  onAutoAnalyzeDone,
}: Props) {
  const [aiQ, setAiQ] = useState("");
  const [aiTurns, setAiTurns] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [aiMeta, setAiMeta] = useState<{ source?: string; model?: string | null } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [contextSubmissionId, setContextSubmissionId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<AiAttachment[]>([]);
  const [attachUploading, setAttachUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoRanRef = useRef<string | null>(null);

  useEffect(() => {
    if (!autoAnalyzeSubmissionId) return;
    if (autoRanRef.current === autoAnalyzeSubmissionId) return;
    autoRanRef.current = autoAnalyzeSubmissionId;
    setContextSubmissionId(autoAnalyzeSubmissionId);
    setAiTurns([{ role: "user", content: ANALYZE_PROMPT }]);
    setAiLoading(true);
    setErr(null);
    (async () => {
      try {
        const { data } = await api.post<{
          answer: string;
          source?: string;
          model?: string | null;
          notice?: string;
          contextUsed?: { submission?: boolean; attachments?: boolean };
        }>(`/labs/${labId}/ai-help`,         buildAiBody([{ role: "user", content: ANALYZE_PROMPT }], autoAnalyzeSubmissionId, []));
        setAiTurns([
          { role: "user", content: ANALYZE_PROMPT },
          { role: "assistant", content: data.answer ?? "" },
        ]);
        setAiNotice(data.notice ?? null);
        setAiMeta({ source: data.source, model: data.model });
      } catch (e: unknown) {
        const msg =
          typeof e === "object" && e !== null && "response" in e
            ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
            : null;
        setErr(msg ?? "AI 分析请求失败");
        setAiTurns([]);
      } finally {
        setAiLoading(false);
        onAutoAnalyzeDone?.();
      }
    })();
  }, [autoAnalyzeSubmissionId, labId, onAutoAnalyzeDone]);

  async function uploadAttachment(file: File) {
    setAttachUploading(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post<{ attachment: AiAttachment }>(
        `/labs/${labId}/ai-help/attachments`,
        fd,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      setAttachments((prev) => [...prev, data.attachment]);
    } catch (e: unknown) {
      const msg =
        typeof e === "object" && e !== null && "response" in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : null;
      setErr(msg ?? "附件上传失败");
    } finally {
      setAttachUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function send() {
    const content = aiQ.trim();
    if (!content) return;
    const payload = [...aiTurns, { role: "user" as const, content }];
    setAiTurns(payload);
    setAiQ("");
    setAiLoading(true);
    setErr(null);
    const attachIds = attachments.map((a) => a.id);
    try {
      const { data } = await api.post<{
        answer: string;
        source?: string;
        model?: string | null;
        notice?: string;
        contextUsed?: { submission?: boolean; attachments?: boolean };
      }>(`/labs/${labId}/ai-help`, buildAiBody(payload, contextSubmissionId, attachIds));
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
  }

  return (
    <div className="grid" style={{ gap: 10 }}>
      {contextSubmissionId ? (
        <div className="muted" style={{ fontSize: 12 }}>
          已关联提交记录，后续对话将继续带入该次提交上下文。
          <button
            type="button"
            className="btn"
            style={{ marginLeft: 8, padding: "2px 8px", fontSize: 12 }}
            onClick={() => setContextSubmissionId(null)}
          >
            取消关联
          </button>
        </div>
      ) : null}
      {aiNotice ? <div className="muted" style={{ fontSize: 12 }}>{aiNotice}</div> : null}
      {aiMeta?.source ? (
        <div className="muted" style={{ fontSize: 12 }}>
          最近回复：
          {aiMeta.source === "llm" ? `大模型${aiMeta.model ? `（${aiMeta.model}）` : ""}` : "本地模板"}
        </div>
      ) : null}
      {err ? <div className="err">{err}</div> : null}
      <div className="lab-ai-chat">
        {aiTurns.length === 0 ? null : (
          aiTurns.map((t, i) => (
            <div key={i} className={`lab-ai-bubble lab-ai-bubble--${t.role}`}>
              {t.role === "assistant" ? (
                <ReactMarkdown>{t.content}</ReactMarkdown>
              ) : (
                <div style={{ whiteSpace: "pre-wrap" }}>{t.content}</div>
              )}
            </div>
          ))
        )}
      </div>
      <div className="field">
        <label>参考附件（可选，仅本会话）</label>
        <div className="row" style={{ flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.py,.js,.ts,.java,.cpp,.c,.h,.md,.json,.pdf,.png,.jpg,.jpeg"
            disabled={attachUploading || aiLoading || attachments.length >= 5}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadAttachment(f);
            }}
          />
          {attachUploading ? <span className="muted" style={{ fontSize: 12 }}>上传中…</span> : null}
        </div>
        {attachments.length > 0 ? (
          <div className="row" style={{ flexWrap: "wrap", gap: 6, marginTop: 6 }}>
            {attachments.map((a) => (
              <span
                key={a.id}
                className="badge"
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                {a.fileName}
                <button
                  type="button"
                  className="btn"
                  style={{ padding: "0 6px", fontSize: 11 }}
                  onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <textarea
        className="lab-ai-input"
        rows={4}
        placeholder="例如：这次提交哪里错了？如何优化？"
        value={aiQ}
        onChange={(e) => setAiQ(e.target.value)}
      />
      <div className="row" style={{ gap: 8 }}>
        <button
          type="button"
          className="btn"
          disabled={aiLoading || aiTurns.length === 0}
          onClick={() => {
            setAiTurns([]);
            setAiNotice(null);
            setAiMeta(null);
            setAttachments([]);
            autoRanRef.current = null;
          }}
        >
          清空对话
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={aiLoading || !aiQ.trim()}
          onClick={() => void send()}
        >
          {aiLoading ? "生成中…" : "发送"}
        </button>
      </div>
    </div>
  );
}
