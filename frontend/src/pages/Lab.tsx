import Editor from "@monaco-editor/react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";

export default function Lab() {
  const { courseId, labId } = useParams();
  const [lab, setLab] = useState<any>(null);
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [subs, setSubs] = useState<any[]>([]);
  const [activeSub, setActiveSub] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setErr(null);
      try {
        const { data } = await api.get(`/labs/${labId}`);
        if (cancelled) return;
        setLab(data.lab);
        setCode(data.lab.starterCode ?? "");
      } catch {
        if (!cancelled) setErr("无法加载实验（先登录并选课）");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [labId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get(`/labs/${labId}/submissions`);
        if (!cancelled) setSubs(data.submissions ?? []);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [labId, submitting]);

  async function submit() {
    setSubmitting(true);
    setErr(null);
    try {
      await api.post(`/labs/${labId}/submit`, { code });
      const { data } = await api.get(`/labs/${labId}/submissions`);
      setSubs(data.submissions ?? []);
      const newest = data.submissions?.[0];
      if (newest?.id) {
        const r = await api.get(`/submissions/${newest.id}`);
        setActiveSub(r.data.submission);
      }
    } catch (e: unknown) {
      const msg =
        typeof e === "object" && e !== null && "response" in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : null;
      setErr(msg ?? "提交失败");
    } finally {
      setSubmitting(false);
    }
  }

  if (!lab && !err) {
    return (
      <div className="container">
        <div className="muted">加载中…</div>
      </div>
    );
  }

  if (err && !lab) {
    return (
      <div className="container">
        <div className="err">{err}</div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="spread" style={{ marginTop: 8 }}>
        <div>
          <div className="muted">
            <Link to={`/courses/${courseId}`}>返回课程</Link>
          </div>
          <h2 style={{ margin: "8px 0 0" }}>{lab.title}</h2>
          <div className="muted" style={{ marginTop: 8, lineHeight: 1.7 }}>
            {lab.description ?? ""}
          </div>
        </div>
        <button className="btn primary" disabled={submitting} type="button" onClick={submit}>
          {submitting ? "提交中…" : "提交评测"}
        </button>
      </div>

      {err ? <div className="err" style={{ marginTop: 10 }}>{err}</div> : null}

      <div className="grid" style={{ marginTop: 14, gridTemplateColumns: "1fr 360px", alignItems: "start" }}>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ borderBottom: "1px solid var(--border)", padding: 12 }} className="spread">
            <span className="muted">语言：{lab.language}</span>
            <span className="muted">编辑器：Monaco</span>
          </div>
          <div style={{ height: 520 }}>
            <Editor
              height="520px"
              theme="vs-dark"
              defaultLanguage={lab.language === "python" ? "python" : "javascript"}
              value={code}
              onChange={(v) => setCode(v ?? "")}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                automaticLayout: true,
              }}
            />
          </div>
        </div>

        <div className="grid">
          <div className="card">
            <div style={{ fontWeight: 900 }}>评测说明</div>
            <div className="muted" style={{ marginTop: 8, lineHeight: 1.7 }}>
              后端将代码以文件方式运行，并从标准输入读入测试用例。请保证输出与样例完全一致（不含多余空格行，系统会
              trim 末尾换行差异已做归一）。
            </div>
          </div>

          <div className="card">
            <div style={{ fontWeight: 900 }}>最近提交</div>
            <div className="grid" style={{ marginTop: 10 }}>
              {subs.slice(0, 8).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="btn"
                  onClick={async () => {
                    const r = await api.get(`/submissions/${s.id}`);
                    setActiveSub(r.data.submission);
                  }}
                >
                  {new Date(s.createdAt).toLocaleString()} · {s.status} ·{" "}
                  {s.score == null ? "-" : `${Number(s.score).toFixed(1)} 分`}
                </button>
              ))}
              {subs.length === 0 ? <div className="muted">暂无提交</div> : null}
            </div>
          </div>

          <div className="card">
            <div style={{ fontWeight: 900 }}>结果详情</div>
            {!activeSub ? <div className="muted" style={{ marginTop: 10 }}>选择一次提交查看</div> : null}
            {activeSub ? (
              <pre
                style={{
                  marginTop: 10,
                  padding: 12,
                  borderRadius: 12,
                  background: "#0b1220",
                  color: "#e6edf7",
                  overflow: "auto",
                  maxHeight: 320,
                  fontSize: 12,
                }}
              >
                {JSON.stringify(
                  {
                    status: activeSub.status,
                    score: activeSub.score,
                    result: (() => {
                      if (!activeSub.resultJson) return null;
                      try {
                        return JSON.parse(activeSub.resultJson);
                      } catch {
                        return activeSub.resultJson;
                      }
                    })(),
                  },
                  null,
                  2,
                )}
              </pre>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
