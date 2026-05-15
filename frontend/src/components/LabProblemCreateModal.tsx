import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import ReactMarkdown from "react-markdown";
import { api } from "../api/client";

type Props = {
  open: boolean;
  courseId: string;
  labSetId: string;
  /** 非空时为编辑已有题目（含已发布/已有提交） */
  editLabId?: string | null;
  onClose: () => void;
  onCreated: () => void;
};

type PublicCaseRow = { key: string; input: string; expected: string; hidden?: boolean; weight?: number };

function newKey() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `k_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function parseCasesFromJsonText(text: string): Array<{
  input: string;
  expected: string;
  hidden?: boolean;
  weight?: number;
}> {
  const j = JSON.parse(text.trim()) as unknown;
  const arr = Array.isArray(j) ? j : (j as { cases?: unknown; testCases?: unknown })?.cases ?? (j as { testCases?: unknown }).testCases;
  if (!Array.isArray(arr)) {
    throw new Error("JSON 须为数组，或为 { cases: [...] } / { testCases: [...] }");
  }
  return arr.map((row: unknown, i: number) => {
    const r = row as { input?: unknown; expected?: unknown; hidden?: unknown; weight?: unknown };
    if (typeof r?.input !== "string" || typeof r?.expected !== "string") {
      throw new Error(`第 ${i + 1} 条缺少字符串字段 input / expected`);
    }
    return {
      input: r.input,
      expected: r.expected,
      hidden: r.hidden === true,
      weight: typeof r.weight === "number" && Number.isFinite(r.weight) ? r.weight : undefined,
    };
  });
}

type TeacherMetrics = {
  labId: string;
  title: string;
  enrollmentCount: number;
  submissionCount: number;
  distinctSubmitters: number;
  acceptedStudentCount: number;
  testCaseStats: Array<{
    testCaseId: string;
    hidden: boolean;
    weight: number;
    passStudentCount: number;
    submissionsWithVerdictOnCase: number;
  }>;
  note?: string;
};

export default function LabProblemCreateModal({
  open,
  courseId,
  labSetId,
  editLabId = null,
  onClose,
  onCreated,
}: Props) {
  const isEdit = Boolean(editLabId);
  const [phase, setPhase] = useState<"form" | "done">("form");
  const [title, setTitle] = useState("");
  const [descriptionMd, setDescriptionMd] = useState("# 题干\n\n请在此用 **Markdown** 编写题目说明。");
  const [language, setLanguage] = useState<"javascript" | "python">("javascript");
  const [starterCode, setStarterCode] = useState('console.log("Hello")\n');
  const [publicCases, setPublicCases] = useState<PublicCaseRow[]>([
    { key: newKey(), input: "", expected: "" },
  ]);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [createdLabId, setCreatedLabId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<TeacherMetrics | null>(null);
  const [metricsErr, setMetricsErr] = useState<string | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);

  const reset = useCallback(() => {
    setPhase("form");
    setTitle("");
    setDescriptionMd("# 题干\n\n请在此用 **Markdown** 编写题目说明。");
    setLanguage("javascript");
    setStarterCode('console.log("Hello")\n');
    setPublicCases([{ key: newKey(), input: "", expected: "" }]);
    setFileErr(null);
    setErr(null);
    setCreatedLabId(null);
    setMetrics(null);
    setMetricsErr(null);
    setMetricsLoading(false);
  }, []);

  useEffect(() => {
    if (!open) {
      reset();
    }
  }, [open, reset]);

  useEffect(() => {
    if (!open || !editLabId) return;
    let cancelled = false;
    (async () => {
      setErr(null);
      setPhase("form");
      try {
        const { data } = await api.get(`/labs/${editLabId}`);
        if (cancelled) return;
        const lab = data.lab as {
          title?: string;
          description?: string;
          descriptionMd?: string | null;
          language?: string;
          starterCode?: string | null;
        };
        setTitle(lab.title ?? "");
        const md = (lab.descriptionMd ?? "").trim();
        const plain = (lab.description ?? "").trim();
        setDescriptionMd(md || plain || "# 题干\n\n请在此用 **Markdown** 编写题目说明。");
        setLanguage(lab.language === "python" ? "python" : "javascript");
        setStarterCode(lab.starterCode ?? "");
      } catch (e: unknown) {
        const msg =
          typeof e === "object" && e !== null && "response" in e
            ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
            : null;
        if (!cancelled) setErr(msg ?? "无法加载题目");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, editLabId]);

  useEffect(() => {
    if (!createdLabId || phase !== "done" || isEdit) return;
    let cancelled = false;
    (async () => {
      setMetricsLoading(true);
      setMetricsErr(null);
      try {
        const { data } = await api.get<TeacherMetrics>(`/labs/${createdLabId}/teacher-metrics`);
        if (!cancelled) setMetrics(data);
      } catch (e: unknown) {
        const msg =
          typeof e === "object" && e !== null && "response" in e
            ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
            : null;
        if (!cancelled) setMetricsErr(msg ?? "统计加载失败");
      } finally {
        if (!cancelled) setMetricsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [createdLabId, phase, isEdit]);

  if (!open) return null;

  function addPublicRow() {
    setPublicCases((rows) => [...rows, { key: newKey(), input: "", expected: "" }]);
  }

  function removePublicRow(key: string) {
    setPublicCases((rows) => (rows.length <= 1 ? rows : rows.filter((r) => r.key !== key)));
  }

  function updateRow(key: string, field: "input" | "expected", value: string) {
    setPublicCases((rows) => rows.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  }

  function onJsonFile(e: ChangeEvent<HTMLInputElement>) {
    setFileErr(null);
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? "");
        const parsed = parseCasesFromJsonText(text);
        setPublicCases((prev) => [
          ...prev,
          ...parsed.map((p) => ({
            key: newKey(),
            input: p.input,
            expected: p.expected,
            hidden: p.hidden,
            weight: p.weight,
          })),
        ]);
      } catch (e2: unknown) {
        setFileErr(e2 instanceof Error ? e2.message : "文件解析失败");
      }
    };
    reader.readAsText(f, "UTF-8");
  }

  return (
    <div
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "24px 12px",
        overflow: "auto",
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="card"
        style={{
          width: "min(960px, 100%)",
          maxHeight: "92vh",
          overflow: "auto",
          marginTop: 12,
          boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="spread">
          <div style={{ fontWeight: 900 }}>
            {phase === "done" ? "题目已创建" : isEdit ? "编辑题目" : "新建题目"}
          </div>
          <button
            type="button"
            className="btn"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            关闭
          </button>
        </div>

        {err ? <div className="err" style={{ marginTop: 10 }}>{err}</div> : null}
        {fileErr ? <div className="err" style={{ marginTop: 8 }}>{fileErr}</div> : null}

        {phase === "done" && !isEdit ? (
          <div className="grid" style={{ marginTop: 14, gap: 12 }}>
            <div className="muted" style={{ fontSize: 14 }}>
              题目 ID：<code>{createdLabId}</code>。公开用例已写入后可到实验管理页继续添加隐藏用例。学生端逐用例测评结果仍通过{" "}
              <code>/submissions/:id/feedback</code> 的 <code>details</code> 返回；下表为教师聚合统计接口{" "}
              <code>GET /labs/:id/teacher-metrics</code>。
            </div>
            {metricsLoading ? <div className="muted">加载统计中…</div> : null}
            {metricsErr ? <div className="err">{metricsErr}</div> : null}
            {metrics && !metricsLoading ? (
              <div className="card" style={{ padding: 12, background: "var(--panel, #0f1629)" }}>
                <div style={{ fontWeight: 800 }}>单题完成情况（刚创建数据多为 0）</div>
                <div className="row" style={{ marginTop: 10, flexWrap: "wrap", gap: 12, fontSize: 13 }}>
                  <span className="muted">选课人数：{metrics.enrollmentCount}</span>
                  <span className="muted">提交次数：{metrics.submissionCount}</span>
                  <span className="muted">提交人数：{metrics.distinctSubmitters}</span>
                  <span className="muted">全 AC 人数：{metrics.acceptedStudentCount}</span>
                </div>
                {metrics.testCaseStats.length ? (
                  <div style={{ marginTop: 12, overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                          <th style={{ padding: 6 }}>用例</th>
                          <th style={{ padding: 6 }}>hidden</th>
                          <th style={{ padding: 6 }}>通过人数</th>
                          <th style={{ padding: 6 }}>含该用例结果的提交数</th>
                        </tr>
                      </thead>
                      <tbody>
                        {metrics.testCaseStats.map((t, i) => (
                          <tr key={t.testCaseId} style={{ borderBottom: "1px solid var(--border)" }}>
                            <td style={{ padding: 6 }}>#{i + 1}</td>
                            <td style={{ padding: 6 }}>{t.hidden ? "是" : "否"}</td>
                            <td style={{ padding: 6 }}>{t.passStudentCount}</td>
                            <td style={{ padding: 6 }}>{t.submissionsWithVerdictOnCase}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="muted" style={{ marginTop: 8 }}>
                    暂无评测用例。
                  </div>
                )}
                {metrics.note ? <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>{metrics.note}</div> : null}
              </div>
            ) : null}
            <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  reset();
                }}
              >
                再建一题
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="field" style={{ marginTop: 12 }}>
              <label>题目名称</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如：两数之和" />
            </div>

            <div className="field">
              <label>语言</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as "javascript" | "python")}
              >
                <option value="javascript">JavaScript (Node)</option>
                <option value="python">Python 3</option>
              </select>
            </div>

            <div className="field">
              <label>在线 IDE 初始代码</label>
              <textarea rows={6} value={starterCode} onChange={(e) => setStarterCode(e.target.value)} />
            </div>

            <div style={{ fontWeight: 800, marginTop: 14 }}>题干（Markdown）</div>
            <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>
              左侧编辑、右侧预览。
            </div>
            <div
              className="grid"
              style={{
                marginTop: 10,
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
                alignItems: "stretch",
              }}
            >
              <div className="grid">
                <label className="muted" style={{ fontSize: 12 }}>
                  编辑
                </label>
                <textarea
                  rows={14}
                  value={descriptionMd}
                  onChange={(e) => setDescriptionMd(e.target.value)}
                  style={{ fontFamily: "ui-monospace, monospace", fontSize: 13 }}
                />
              </div>
              <div className="grid">
                <label className="muted" style={{ fontSize: 12 }}>
                  预览
                </label>
                <div
                  className="card"
                  style={{
                    padding: 12,
                    minHeight: 280,
                    overflow: "auto",
                    fontSize: 14,
                    lineHeight: 1.65,
                    background: "var(--panel, #0f1629)",
                  }}
                >
                  <ReactMarkdown>{descriptionMd || "（空）"}</ReactMarkdown>
                </div>
              </div>
            </div>

            {!isEdit ? (
              <>
                <div style={{ fontWeight: 800, marginTop: 16 }}>公开测试用例（可多行）</div>
                <div className="muted" style={{ marginTop: 4, fontSize: 13, lineHeight: 1.55 }}>
                  每条为 stdin / 期望 stdout。表格中未勾 hidden 的用例默认 <code>hidden=false</code>。UTF-8 JSON 文件可为数组{" "}
                  <code>{"[{ \"input\": \"\", \"expected\": \"\" }]"}</code> 或对象{" "}
                  <code>{"{ \"cases\": [ ... ] }"}</code>；条目可含 <code>hidden</code>、<code>weight</code>。
                </div>
                <div className="row" style={{ marginTop: 8, gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <label className="btn" style={{ cursor: "pointer", margin: 0 }}>
                    从 JSON 文件追加
                    <input type="file" accept=".json,.txt,application/json" style={{ display: "none" }} onChange={onJsonFile} />
                  </label>
                  <button type="button" className="btn" onClick={addPublicRow}>
                    添加一行
                  </button>
                </div>

                <div className="grid" style={{ marginTop: 10, gap: 10 }}>
                  {publicCases.map((row, idx) => (
                    <div
                      key={row.key}
                      className="card"
                      style={{ padding: 10, background: "var(--panel, #0f1629)" }}
                    >
                      <div className="spread" style={{ marginBottom: 6 }}>
                        <span style={{ fontWeight: 700, fontSize: 13 }}>用例 #{idx + 1}</span>
                        <button type="button" className="btn" onClick={() => removePublicRow(row.key)}>
                          删除
                        </button>
                      </div>
                      <div className="field" style={{ margin: 0 }}>
                        <label className="muted" style={{ fontSize: 12 }}>
                          输入（stdin）
                        </label>
                        <textarea
                          rows={2}
                          value={row.input}
                          onChange={(e) => updateRow(row.key, "input", e.target.value)}
                        />
                      </div>
                      <div className="field" style={{ margin: 0 }}>
                        <label className="muted" style={{ fontSize: 12 }}>
                          期望输出（stdout）
                        </label>
                        <textarea
                          rows={2}
                          value={row.expected}
                          onChange={(e) => updateRow(row.key, "expected", e.target.value)}
                        />
                      </div>
                      <label className="row" style={{ gap: 8, marginTop: 6, fontSize: 12, alignItems: "center" }}>
                        <input
                          type="checkbox"
                          checked={!!row.hidden}
                          onChange={(e) =>
                            setPublicCases((rows) =>
                              rows.map((r) =>
                                r.key === row.key ? { ...r, hidden: e.target.checked } : r,
                              ),
                            )
                          }
                        />
                        作为隐藏用例（hidden）
                      </label>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="muted" style={{ marginTop: 14, fontSize: 13, lineHeight: 1.6 }}>
                测试用例与附件请在题目页底部「教师」面板维护；此处仅修改题面与初始代码。
              </div>
            )}

            <div className="row" style={{ marginTop: 16, justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="btn" disabled={saving} onClick={() => { reset(); onClose(); }}>
                取消
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={saving || !title.trim()}
                onClick={async () => {
                  setSaving(true);
                  setErr(null);
                  try {
                    if (isEdit && editLabId) {
                      await api.patch(`/labs/${editLabId}`, {
                        title: title.trim(),
                        description: title.trim(),
                        descriptionMd: descriptionMd.trim() || null,
                        language,
                        starterCode,
                      });
                      onCreated();
                      reset();
                      onClose();
                    } else {
                      const { data } = await api.post(`/courses/${courseId}/labs`, {
                        labSetId,
                        title: title.trim(),
                        language,
                        starterCode,
                        description: title.trim(),
                        descriptionMd: descriptionMd.trim() || undefined,
                      });
                      const labId = data.lab?.id as string;
                      const batch = publicCases
                        .map((r) => ({
                          input: r.input,
                          expected: r.expected,
                          hidden: r.hidden ?? false,
                          weight: r.weight ?? 1,
                        }))
                        .filter((r) => r.input.trim().length > 0 || r.expected.trim().length > 0);
                      if (labId && batch.length > 0) {
                        await api.post(`/labs/${labId}/testcases/batch`, { testCases: batch });
                      }
                      onCreated();
                      setCreatedLabId(labId);
                      setPhase("done");
                    }
                  } catch (e: unknown) {
                    const msg =
                      typeof e === "object" && e !== null && "response" in e
                        ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
                        : null;
                    setErr(msg ?? (isEdit ? "保存失败" : "创建失败"));
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {saving ? "保存中…" : isEdit ? "保存修改" : "创建题目"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
