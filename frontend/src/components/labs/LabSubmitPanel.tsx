import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../api/client";
import type { LabDetail, SubmissionFeedback, TestCaseDetail } from "./labTypes";

type Props = {
  labId: string;
  lab: LabDetail;
  canSubmit: boolean;
  onSubmitted?: (submissionId: string) => void;
  onAiAnalyze?: (submissionId: string) => void;
};

const TERMINAL_STATUSES = new Set([
  "ACCEPTED",
  "WRONG_ANSWER",
  "ERROR",
  "TIMEOUT",
  "PENDING_REVIEW",
]);

const JUDGE_TIMEOUT_SEC = 60;
const JUDGE_POLL_MS = 800;

function formatJudgeElapsed(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s} 秒`;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function statusLabel(status: string) {
  switch (status) {
    case "ACCEPTED":
      return "通过";
    case "WRONG_ANSWER":
      return "答案错误";
    case "PENDING":
    case "JUDGING":
      return "评测中";
    case "PENDING_REVIEW":
      return "待批改";
    case "ERROR":
      return "运行错误";
    case "TIMEOUT":
      return "运行超时";
    default:
      return status;
  }
}

function JudgeTimerPanel({ elapsedSec }: { elapsedSec: number }) {
  const pct = Math.min(100, Math.round((elapsedSec / JUDGE_TIMEOUT_SEC) * 100));
  const nearLimit = elapsedSec >= JUDGE_TIMEOUT_SEC - 10;

  return (
    <div className={`lab-judge-timer${nearLimit ? " lab-judge-timer--warn" : ""}`}>
      <div className="lab-judge-timer__head">
        <span className="lab-judge-timer__spinner" aria-hidden />
        <span>
          评测进行中 · 已等待 <strong>{formatJudgeElapsed(elapsedSec)}</strong>
          <span className="muted"> / {JUDGE_TIMEOUT_SEC} 秒</span>
        </span>
      </div>
      <div className="lab-judge-timer__bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="lab-judge-timer__fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="muted lab-judge-timer__hint">
        计时仅表示等待评测结果的时间；超过 {JUDGE_TIMEOUT_SEC} 秒将自动提示异常。
      </p>
    </div>
  );
}

function isJudgingStatus(status: string) {
  return status === "PENDING" || status === "JUDGING";
}

function TestCaseResultItem({ detail, index }: { detail: TestCaseDetail; index: number }) {
  const passed = detail.pass === true;
  const label = detail.hidden ? `隐藏用例 ${index + 1}` : `测试样例 ${index + 1}`;

  return (
    <details className="lab-tc-result">
      <summary>
        <span className={`disc-badge ${passed ? "disc-badge--ok" : "disc-badge--fail"}`}>
          {passed ? "通过" : "未通过"}
        </span>
        {label}
      </summary>
      <div className="lab-tc-result-body">
        {detail.hidden ? (
          <div className="muted">隐藏用例不展示输入输出，仅显示是否通过。</div>
        ) : (
          <>
            {detail.input !== undefined ? (
              <div className="lab-tc-result-row">
                <div className="muted">输入</div>
                <pre className="lab-code-block">{detail.input === "" ? "（空输入）" : detail.input}</pre>
              </div>
            ) : null}
            {detail.expected !== undefined ? (
              <div className="lab-tc-result-row">
                <div className="muted">期望输出</div>
                <pre className="lab-code-block">{detail.expected}</pre>
              </div>
            ) : null}
            {detail.got !== undefined ? (
              <div className="lab-tc-result-row">
                <div className="muted">实际输出</div>
                <pre className="lab-code-block">{detail.got === "" ? "（空输出）" : detail.got}</pre>
              </div>
            ) : null}
          </>
        )}
        {detail.stderr ? (
          <div className="lab-tc-result-row">
            <div className="muted">错误信息</div>
            <pre className="lab-code-block">{detail.stderr}</pre>
          </div>
        ) : null}
        {detail.error ? (
          <div className="lab-tc-result-row err">{detail.error}</div>
        ) : null}
      </div>
    </details>
  );
}

export default function LabSubmitPanel({
  labId,
  lab,
  canSubmit,
  onSubmitted,
  onAiAnalyze,
}: Props) {
  const cfg = lab.judgeConfig;
  const pollAbortRef = useRef(false);
  const judgeStartedAtRef = useRef<number | null>(null);
  const [language, setLanguage] = useState(cfg.allowedLanguages[0] ?? lab.language);
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [judging, setJudging] = useState(false);
  const [judgingElapsedSec, setJudgingElapsedSec] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<SubmissionFeedback | null>(null);
  const [pendingReturn, setPendingReturn] = useState<string | null>(null);

  async function refreshFeedback(submissionId: string): Promise<SubmissionFeedback> {
    const { data } = await api.get<SubmissionFeedback>(`/submissions/${submissionId}/feedback`);
    setFeedback(data);
    if (data.submission?.returnReason) {
      setPendingReturn(data.submission.returnReason);
    }
    return data;
  }

  useEffect(() => {
    void api
      .get<{ submissions: { id: string; returnReason?: string | null }[] }>(
        `/labs/${labId}/submissions`,
      )
      .then(({ data }) => {
        const latest = data.submissions?.[0];
        if (latest?.returnReason) {
          setPendingReturn(latest.returnReason);
          void refreshFeedback(latest.id).catch(() => undefined);
        }
      })
      .catch(() => undefined);
  }, [labId]);

  const examples = useMemo(() => lab.testCases ?? [], [lab.testCases]);
  const activeSub = feedback?.submission ?? null;
  const testDetails = feedback?.feedback?.details ?? [];
  const status = activeSub?.status ?? "";
  const isJudging = isJudgingStatus(status);
  const showJudgeTimer = judging || isJudging;

  useEffect(() => {
    if (!showJudgeTimer) {
      setJudgingElapsedSec(0);
      judgeStartedAtRef.current = null;
      return;
    }

    if (judgeStartedAtRef.current == null) {
      judgeStartedAtRef.current = activeSub?.createdAt
        ? new Date(activeSub.createdAt).getTime()
        : Date.now();
    }

    const tick = () => {
      const start = judgeStartedAtRef.current ?? Date.now();
      const sec = Math.floor((Date.now() - start) / 1000);
      setJudgingElapsedSec(sec);
    };

    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [showJudgeTimer, activeSub?.createdAt]);

  const judgeTimeoutMessage =
    `评测已超过 ${JUDGE_TIMEOUT_SEC} 秒未完成，可能 judge-worker 或 Redis 未启动（见 RUN.txt），请检查后重试。`;

  async function waitForResult(submissionId: string) {
    pollAbortRef.current = false;
    judgeStartedAtRef.current = Date.now();
    setJudgingElapsedSec(0);
    const deadline = Date.now() + JUDGE_TIMEOUT_SEC * 1000;

    while (Date.now() < deadline) {
      if (pollAbortRef.current) return;
      const data = await refreshFeedback(submissionId);
      const nextStatus = data.submission?.status ?? "";
      if (TERMINAL_STATUSES.has(nextStatus)) return;
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      await sleep(Math.min(JUDGE_POLL_MS, remaining));
    }

    if (!pollAbortRef.current) {
      pollAbortRef.current = true;
      setErr(judgeTimeoutMessage);
    }
  }

  async function submitFile() {
    if (!file) {
      setErr("请选择要上传的文件");
      return;
    }
    setSubmitting(true);
    setJudging(false);
    setErr(null);
    setFeedback(null);
    pollAbortRef.current = true;

    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("language", language);
      const { data } = await api.post<{ submissionId: string }>(`/labs/${labId}/submit-file`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setFile(null);

      if (!data.submissionId) return;

      onSubmitted?.(data.submissionId);

      if (cfg.judgeMode === "MANUAL") {
        await refreshFeedback(data.submissionId);
        return;
      }

      setJudging(true);
      setErr(null);
      judgeStartedAtRef.current = Date.now();
      await waitForResult(data.submissionId);
      setPendingReturn(null);
    } catch (e: unknown) {
      const msg =
        typeof e === "object" && e !== null && "response" in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : null;
      setErr(msg ?? "提交失败");
    } finally {
      setSubmitting(false);
      setJudging(false);
    }
  }

  return (
    <div className="grid" style={{ gap: 14 }}>
      <div className="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
        批改模式：
        <strong>{cfg.judgeMode === "MANUAL" ? "教师手动批改" : "自动评测"}</strong>
        ；允许语言：{cfg.allowedLanguages.join("、")}；允许扩展名：
        {cfg.allowedFileExtensions.join(" ")}
      </div>

      {pendingReturn ? (
        <div className="practice-ai-notice" style={{ borderColor: "#fcd34d", background: "#fffbeb" }}>
          <strong>教师已打回本次提交</strong>
          <p style={{ margin: "6px 0 0", fontSize: 13 }}>{pendingReturn}</p>
          <p className="muted" style={{ margin: "6px 0 0", fontSize: 12 }}>
            请修改后重新上传提交。
          </p>
        </div>
      ) : null}

      <section>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>公开样例</div>
        {examples.length === 0 ? (
          <div className="muted">暂无公开样例</div>
        ) : (
          examples.map((t, i) => (
            <div
              key={t.id}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: 10,
                marginBottom: 8,
                background: "#fafbff",
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 6 }}>样例 {i + 1}</div>
              <pre className="lab-code-block">{t.input === "" ? "（空输入）" : t.input}</pre>
              <div className="muted" style={{ fontSize: 12, margin: "6px 0 4px" }}>
                期望输出
              </div>
              <pre className="lab-code-block">{t.expected}</pre>
            </div>
          ))
        )}
      </section>

      <section className="card" style={{ padding: 14 }}>
        <div style={{ fontWeight: 800, marginBottom: 10 }}>上传提交</div>
        <div className="field">
          <label>评测语言</label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            disabled={!canSubmit || submitting || judging}
          >
            {cfg.allowedLanguages.map((lang) => (
              <option key={lang} value={lang}>
                {lang}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ marginTop: 10 }}>
          <label>代码文件</label>
          <input
            type="file"
            disabled={!canSubmit || submitting || judging}
            accept={cfg.allowedFileExtensions.join(",")}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {file ? (
            <span className="muted" style={{ fontSize: 12 }}>
              已选：{file.name}
            </span>
          ) : null}
        </div>
        {err ? <div className="err" style={{ marginTop: 8 }}>{err}</div> : null}
        <button
          type="button"
          className="btn primary lab-pressable"
          style={{ marginTop: 12 }}
          disabled={submitting || judging || !canSubmit || !file}
          onClick={() => void submitFile()}
        >
          {submitting ? "提交中…" : judging ? "评测中…" : cfg.judgeMode === "MANUAL" ? "提交待批改" : "提交评测"}
        </button>
        {!canSubmit ? (
          <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>
            当前不在可提交时间窗内。
          </p>
        ) : null}
      </section>

      {showJudgeTimer ? <JudgeTimerPanel elapsedSec={judgingElapsedSec} /> : null}

      {activeSub ? (
        <section>
          <div className="row spread" style={{ flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
            <div>
              <div style={{ fontWeight: 800 }}>本次测评结果</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                {new Date(activeSub.createdAt).toLocaleString()} · {statusLabel(status)}
                {activeSub.score != null ? ` · ${Number(activeSub.score).toFixed(1)} 分` : ""}
              </div>
            </div>
            <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
              {!isJudging && status !== "PENDING_REVIEW" ? (
                <button
                  type="button"
                  className="btn"
                  onClick={() => onAiAnalyze?.(activeSub.id)}
                >
                  AI 分析
                </button>
              ) : null}
              {activeSub.submissionKind === "FILE" || activeSub.fileName ? (
                <a
                  className="btn"
                  href={`/api/submissions/${activeSub.id}/download`}
                  target="_blank"
                  rel="noreferrer"
                >
                  下载文件
                </a>
              ) : null}
            </div>
          </div>

          {isJudging && testDetails.length === 0 ? (
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>
              正在等待评测机返回结果，请查看上方计时条。
            </p>
          ) : status === "PENDING_REVIEW" ? (
            <div className="muted" style={{ fontSize: 13 }}>已提交，等待教师批改。</div>
          ) : testDetails.length > 0 ? (
            testDetails.map((d, i) => <TestCaseResultItem key={d.testCaseId ?? i} detail={d} index={i} />)
          ) : feedback?.feedback?.error ? (
            <div className="err" style={{ fontSize: 13 }}>{feedback.feedback.error}</div>
          ) : feedback?.feedback?.last?.stderr ? (
            <div className="lab-tc-result-row">
              <div className="muted">运行错误</div>
              <pre className="lab-code-block">{feedback.feedback.last.stderr}</pre>
            </div>
          ) : feedback?.feedback?.note ? (
            <div className="muted" style={{ fontSize: 13 }}>{feedback.feedback.note}</div>
          ) : (
            <div className="muted" style={{ fontSize: 13 }}>暂无逐样例评测详情。</div>
          )}
        </section>
      ) : null}
    </div>
  );
}
