import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import LabAiPanel from "../components/labs/LabAiPanel";
import LabDiscussionPanel from "../components/labs/LabDiscussionPanel";
import LabSubmitPanel from "../components/labs/LabSubmitPanel";
import LabAttachmentsPanel from "../components/labs/LabAttachmentsPanel";
import LabSetTimeBanner from "../features/labs/LabSetTimeBanner";
import type { LabDetail } from "../components/labs/labTypes";

type RightTab = "submit" | "ai" | "discussion";

export default function Lab() {
  const { courseId, labId } = useParams();
  const { user } = useAuth();
  const [lab, setLab] = useState<LabDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<RightTab>("submit");
  const [aiSubmissionId, setAiSubmissionId] = useState<string | null>(null);

  const isTeacher = user?.role === "TEACHER" || user?.role === "ADMIN";

  const canSubmitLab = useMemo(() => {
    if (!lab) return false;
    if (isTeacher) return true;
    return lab.labSet?.access?.canSubmit !== false;
  }, [lab, isTeacher]);

  const mdSource = useMemo(() => {
    if (!lab) return "";
    const md = lab.descriptionMd?.trim();
    if (md) return md;
    const plain = lab.description?.trim();
    return plain ? plain.replace(/\n/g, "\n\n") : "_暂无题干说明。_";
  }, [lab]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setErr(null);
      try {
        const { data } = await api.get<{ lab: LabDetail }>(`/labs/${labId}`);
        if (!cancelled) {
          setLab(data.lab);
          if (!data.lab.judgeConfig) {
            setLab({
              ...data.lab,
              judgeConfig: {
                judgeMode: "AUTO",
                allowedLanguages: [data.lab.language],
                allowedFileExtensions: [".py", ".js", ".ts", ".java", ".cpp", ".c"],
              },
            });
          }
        }
      } catch (e: unknown) {
        if (!cancelled) {
          const msg =
            typeof e === "object" && e !== null && "response" in e
              ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
              : null;
          setErr(msg ?? "无法加载实验");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [labId]);

  function tabBtn(id: RightTab, label: string) {
    const on = rightTab === id;
    return (
      <button
        key={id}
        type="button"
        className="lab-tab-btn"
        data-active={on ? "true" : "false"}
        onClick={() => setRightTab(id)}
      >
        {label}
      </button>
    );
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

  if (!lab || !labId || !courseId) return null;

  return (
    <div className="container lab-page">
      <div className="row spread" style={{ marginTop: 4, flexWrap: "wrap", gap: 10 }}>
        <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
          <Link to={`/courses/${courseId}`} className="muted">
            返回课程
          </Link>
          {lab.labSet?.id ? (
            <Link to={`/courses/${courseId}/labs/sets/${lab.labSet.id}`} className="muted">
              返回实验集
            </Link>
          ) : null}
        </div>
      </div>

      {lab.labSet ? (
        <div style={{ marginTop: 10 }}>
          <LabSetTimeBanner labSet={lab.labSet as Record<string, unknown>} />
        </div>
      ) : null}
      {err ? <div className="err" style={{ marginTop: 10 }}>{err}</div> : null}

      <div className="lab-split">
        <div className="card lab-md-root lab-pane-left">
          <h1 className="lab-title">{lab.title}</h1>
          <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
            默认语言：{lab.language}
            {lab.labSet?.title ? ` · 实验集：${lab.labSet.title}` : null}
          </div>
          <ReactMarkdown>{mdSource}</ReactMarkdown>
          {lab.starterCode ? (
            <div style={{ marginTop: 16 }}>
              <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>
                参考代码（只读）
              </div>
              <pre className="lab-code-block">{lab.starterCode}</pre>
            </div>
          ) : null}
          <div style={{ marginTop: 16 }}>
            <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>
              附件资料
            </div>
            <LabAttachmentsPanel labId={labId} isTeacher={isTeacher} />
          </div>
        </div>

        <div className="lab-pane-right card">
          <div className="lab-tab-bar">
            {tabBtn("submit", "提交测评")}
            {tabBtn("ai", "AI 助手")}
            {tabBtn("discussion", "讨论区")}
          </div>
          <div className="lab-tab-body">
            {rightTab === "submit" ? (
              <LabSubmitPanel
                labId={labId}
                lab={lab}
                canSubmit={canSubmitLab}
                onAiAnalyze={(id) => {
                  setAiSubmissionId(id);
                  setRightTab("ai");
                }}
              />
            ) : null}
            {rightTab === "ai" ? (
              <LabAiPanel
                labId={labId}
                autoAnalyzeSubmissionId={aiSubmissionId}
                onAutoAnalyzeDone={() => setAiSubmissionId(null)}
              />
            ) : null}
            {rightTab === "discussion" ? (
              <LabDiscussionPanel courseId={courseId} labId={labId} />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
