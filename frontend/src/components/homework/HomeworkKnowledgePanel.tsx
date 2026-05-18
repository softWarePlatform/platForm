import { useEffect, useState } from "react";
import {
  askKnowledgeGap,
  fetchKnowledgeGap,
  generateWrongBook,
} from "./homeworkStudentApi";

type Point = { name: string; level: "weak" | "fair" | "good"; evidence?: string };

type Analysis = {
  points?: Point[];
  summary?: string;
  practiceSuggestions?: string[];
};

const LEVEL_LABEL = { weak: "薄弱", fair: "一般", good: "良好" } as const;

type Props = { homeworkId: string; visible: boolean };

export default function HomeworkKnowledgePanel({ homeworkId, visible }: Props) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<Point | null>(null);
  const [explain, setExplain] = useState("");
  const [question, setQuestion] = useState("");
  const [askAnswer, setAskAnswer] = useState("");

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      setBusy(true);
      setErr(null);
      try {
        const a = (await fetchKnowledgeGap(homeworkId)) as Analysis;
        if (!cancelled) setAnalysis(a);
      } catch (e: unknown) {
        const msg =
          typeof e === "object" && e !== null && "response" in e
            ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
            : null;
        if (!cancelled) setErr(msg ?? "无法加载知识漏洞分析");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [homeworkId, visible]);

  if (!visible) return null;

  return (
    <div className="card grid" style={{ marginTop: 12, boxShadow: "none", gap: 12 }}>
      <div style={{ fontWeight: 800 }}>知识漏洞分析</div>
      {busy ? <div className="muted">分析中…</div> : null}
      {err ? <div className="err">{err}</div> : null}
      {analysis?.summary ? (
        <p className="muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>
          {analysis.summary}
        </p>
      ) : null}
      {analysis?.points?.length ? (
        <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
          {analysis.points.map((p) => (
            <li
              key={p.name}
              style={{
                borderTop: "1px solid var(--border)",
                padding: "10px 0",
                cursor: p.level === "weak" ? "pointer" : "default",
              }}
              onClick={() => {
                if (p.level !== "weak") return;
                setSelected(p);
                setExplain(
                  `【${p.name}】${p.evidence ?? ""}\n\n建议：${(analysis.practiceSuggestions ?? []).join("；") || "复习相关章节并完成配套练习"}`,
                );
              }}
            >
              <div className="row spread">
                <strong>{p.name}</strong>
                <span className={`hw-kp hw-kp--${p.level}`}>{LEVEL_LABEL[p.level]}</span>
              </div>
              {p.evidence ? (
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  {p.evidence}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {selected && explain ? (
        <div
          style={{
            padding: 12,
            borderRadius: 8,
            background: "var(--surface-2)",
            fontSize: 13,
            whiteSpace: "pre-wrap",
            lineHeight: 1.65,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>薄弱知识点讲解</div>
          {explain}
        </div>
      ) : null}
      <div className="grid" style={{ gap: 8 }}>
        <label className="muted" style={{ fontSize: 13 }}>
          这道题为什么错了？
        </label>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <input
            style={{ flex: 1, minWidth: 200 }}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="描述你的疑问…"
          />
          <button
            type="button"
            className="btn"
            disabled={!question.trim() || busy}
            onClick={async () => {
              setBusy(true);
              try {
                const ans = await askKnowledgeGap(homeworkId, question.trim());
                setAskAnswer(ans);
              } finally {
                setBusy(false);
              }
            }}
          >
            AI 解析
          </button>
        </div>
        {askAnswer ? (
          <div style={{ fontSize: 13, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{askAnswer}</div>
        ) : null}
      </div>
      <button
        type="button"
        className="btn"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const n = await generateWrongBook(homeworkId);
            setErr(null);
            alert(n > 0 ? `已加入错题本 ${n} 条` : "暂无薄弱项可加入错题本");
          } catch (e: unknown) {
            const msg =
              typeof e === "object" && e !== null && "response" in e
                ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
                : null;
            setErr(msg ?? "生成失败");
          } finally {
            setBusy(false);
          }
        }}
      >
        生成错题本
      </button>
    </div>
  );
}
