import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { api } from "../../../api/client";

export type TutorTurn = { role: "user" | "assistant"; content: string };

type Props = {
  sessionId: string;
  itemId: string;
  disabled?: boolean;
  initialMessages: TutorTurn[];
  onMessagesChange?: (messages: TutorTurn[]) => void;
};

export default function PracticeTutorChat({
  sessionId,
  itemId,
  disabled,
  initialMessages,
  onMessagesChange,
}: Props) {
  const [turns, setTurns] = useState<TutorTurn[]>(initialMessages);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ source?: string; model?: string | null } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const prevItemId = useRef(itemId);
  useEffect(() => {
    if (prevItemId.current !== itemId) {
      prevItemId.current = itemId;
      setTurns(initialMessages);
      setErr(null);
      setNotice(null);
      setMeta(null);
      setInput("");
    }
  }, [itemId, initialMessages]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, loading]);

  async function send(opts: { text?: string; quickAction?: "initial" | "more" | "example" }) {
    if (disabled || loading) return;
    setLoading(true);
    setErr(null);
    try {
      const { data } = await api.post<{
        reply: string;
        messages: TutorTurn[];
        source?: string;
        model?: string | null;
        notice?: string;
      }>(`/practice/sessions/${sessionId}/items/${itemId}/tutor`, opts);
      const next = data.messages ?? [];
      setTurns(next);
      onMessagesChange?.(next);
      setNotice(data.notice ?? null);
      setMeta({ source: data.source, model: data.model });
    } catch (e: unknown) {
      const msg =
        typeof e === "object" && e !== null && "response" in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : null;
      setErr(msg ?? "AI 辅导暂不可用");
    } finally {
      setLoading(false);
    }
  }

  async function clearChat() {
    if (disabled || loading) return;
    setLoading(true);
    setErr(null);
    try {
      await api.post(`/practice/sessions/${sessionId}/items/${itemId}/tutor`, { clear: true });
      setTurns([]);
      onMessagesChange?.([]);
      setNotice(null);
      setMeta(null);
    } catch (e: unknown) {
      const msg =
        typeof e === "object" && e !== null && "response" in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : null;
      setErr(msg ?? "清空失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="practice-tutor">
      <div ref={scrollRef} className="practice-tutor__thread">
        {turns.length === 0 ? (
          <p className="muted practice-tutor__empty">
            可向 AI 辅导提问，支持多轮追问。辅导不会直接给出本题最终答案。
          </p>
        ) : (
          turns.map((t, i) => (
            <div
              key={i}
              className={`practice-tutor__bubble practice-tutor__bubble--${t.role}`}
            >
              {t.role === "assistant" ? (
                <ReactMarkdown>{t.content}</ReactMarkdown>
              ) : (
                <div style={{ whiteSpace: "pre-wrap" }}>{t.content}</div>
              )}
            </div>
          ))
        )}
        {loading ? (
          <p className="muted practice-tutor__typing">AI 正在思考…</p>
        ) : null}
      </div>

      {err ? <p className="err practice-tutor__err">{err}</p> : null}
      {notice ? <p className="practice-ai-notice">{notice}</p> : null}
      {meta?.source === "llm" && meta.model ? (
        <p className="muted" style={{ fontSize: 12, margin: 0 }}>
          由 {meta.model} 生成
        </p>
      ) : null}

      <div className="row practice-tutor__quick" style={{ gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn"
          disabled={disabled || loading}
          onClick={() => void send({ quickAction: "initial" })}
        >
          不会做
        </button>
        <button
          type="button"
          className="btn"
          disabled={disabled || loading}
          onClick={() => void send({ quickAction: "more" })}
        >
          再详细一点
        </button>
        <button
          type="button"
          className="btn"
          disabled={disabled || loading}
          onClick={() => void send({ quickAction: "example" })}
        >
          类似例题
        </button>
        <button
          type="button"
          className="btn"
          disabled={disabled || loading || turns.length === 0}
          onClick={() => void clearChat()}
        >
          清空对话
        </button>
      </div>

      <textarea
        rows={3}
        className="field practice-tutor__input"
        placeholder="输入你的疑问，例如：第一步应该考虑什么？"
        value={input}
        disabled={disabled || loading}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            const text = input.trim();
            if (!text || disabled || loading) return;
            setInput("");
            void send({ text });
          }
        }}
      />
      <button
        type="button"
        className="btn primary"
        disabled={disabled || loading || !input.trim()}
        onClick={() => {
          const text = input.trim();
          if (!text) return;
          setInput("");
          void send({ text });
        }}
      >
        {loading ? "发送中…" : "发送"}
      </button>
    </div>
  );
}
