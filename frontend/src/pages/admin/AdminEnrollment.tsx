import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../api/client";

type EnrollmentPhase = "PRESELECT" | "FORMAL" | "ADD_DROP" | "CLOSED";

type Period = {
  id?: string;
  semesterKey: string;
  label: string | null;
  phase: EnrollmentPhase;
  openAt: string;
  closeAt: string;
  confirmDeadline: string | null;
};

type PeriodResponse = {
  semester: { key: string; label: string };
  period: Period | null;
};

type FormState = {
  label: string;
  phase: EnrollmentPhase;
  openAt: string;
  closeAt: string;
  confirmDeadline: string;
};

const PHASE_OPTIONS: Array<{ value: EnrollmentPhase; label: string }> = [
  { value: "PRESELECT", label: "预选" },
  { value: "FORMAL", label: "正选" },
  { value: "ADD_DROP", label: "补退选" },
  { value: "CLOSED", label: "已关闭" },
];

function toInputDateTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function getErrorMessage(e: unknown, fallback: string) {
  return typeof e === "object" && e !== null && "response" in e
    ? (e as { response?: { data?: { error?: string } } }).response?.data?.error ?? fallback
    : fallback;
}

export default function AdminEnrollment() {
  const [semester, setSemester] = useState<{ key: string; label: string } | null>(null);
  const [form, setForm] = useState<FormState>({
    label: "",
    phase: "PRESELECT",
    openAt: "",
    closeAt: "",
    confirmDeadline: "",
  });
  const [userId, setUserId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [manualBusy, setManualBusy] = useState<"enroll" | "drop" | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    const { data } = await api.get<PeriodResponse>("/enrollment/period");
    setSemester(data.semester);
    setForm({
      label: data.period?.label ?? data.semester.label,
      phase: data.period?.phase ?? "PRESELECT",
      openAt: toInputDateTime(data.period?.openAt),
      closeAt: toInputDateTime(data.period?.closeAt),
      confirmDeadline: toInputDateTime(data.period?.confirmDeadline),
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await load();
      } catch (e) {
        if (!cancelled) setErr(getErrorMessage(e, "无法加载选课配置"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const canSubmitPeriod = useMemo(
    () => form.phase === "CLOSED" || (!!form.openAt && !!form.closeAt),
    [form.closeAt, form.openAt, form.phase],
  );

  async function savePeriod() {
    if (!canSubmitPeriod) {
      setErr("请填写开放开始与结束时间");
      return;
    }
    setSaving(true);
    setErr(null);
    setOkMsg(null);
    try {
      const now = new Date();
      const openAt = form.openAt || toInputDateTime(now.toISOString());
      const closeAt = form.closeAt || toInputDateTime(now.toISOString());
      const { data } = await api.put<{ period: Period }>("/enrollment/period", {
        label: form.label.trim() || semester?.label,
        phase: form.phase,
        openAt: new Date(openAt).toISOString(),
        closeAt: new Date(closeAt).toISOString(),
        confirmDeadline: form.confirmDeadline ? new Date(form.confirmDeadline).toISOString() : null,
      });
      setOkMsg("选课时段配置已保存");
      setForm((prev) => ({
        ...prev,
        label: data.period.label ?? semester?.label ?? prev.label,
        openAt: toInputDateTime(data.period.openAt),
        closeAt: toInputDateTime(data.period.closeAt),
        confirmDeadline: toInputDateTime(data.period.confirmDeadline),
      }));
    } catch (e) {
      setErr(getErrorMessage(e, "保存失败"));
    } finally {
      setSaving(false);
    }
  }

  async function manual(action: "enroll" | "drop") {
    if (!userId.trim() || !courseId.trim()) {
      setErr("请填写用户 ID 和课程 ID");
      return;
    }
    setManualBusy(action);
    setErr(null);
    setOkMsg(null);
    try {
      await api.post(`/enrollment/admin/${action}`, {
        userId: userId.trim(),
        courseId: courseId.trim(),
      });
      setOkMsg(action === "enroll" ? "已为学生手动加课" : "已为学生手动退课");
    } catch (e) {
      setErr(getErrorMessage(e, action === "enroll" ? "手动加课失败" : "手动退课失败"));
    } finally {
      setManualBusy(null);
    }
  }

  return (
    <>
      <header className="admin-page-header">
        <h1>选课配置</h1>
        <p className="muted" style={{ margin: 0 }}>
          设置当前学期选课阶段与时段，并在特殊情况中手动加退课
        </p>
      </header>

      {err ? <div className="err" style={{ marginBottom: 12 }}>{err}</div> : null}
      {okMsg ? <span className="save-ok" style={{ display: "block", marginBottom: 12 }}>{okMsg}</span> : null}

      {loading ? (
        <div className="muted">加载配置…</div>
      ) : (
        <div className="admin-form-grid">
          <section className="card admin-section-card">
            <h2>选课时段</h2>
            <p className="muted">当前学期：{semester?.label ?? "未识别"}</p>
            <label className="admin-field">
              <span>配置名称</span>
              <input
                value={form.label}
                onChange={(e) => setForm((prev) => ({ ...prev, label: e.target.value }))}
                placeholder={semester?.label ?? "如：2026 春季选课"}
              />
            </label>
            <label className="admin-field">
              <span>选课阶段</span>
              <select
                value={form.phase}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, phase: e.target.value as EnrollmentPhase }))
                }
              >
                {PHASE_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>
            <div className="admin-two-col">
              <label className="admin-field">
                <span>开放时间</span>
                <input
                  type="datetime-local"
                  value={form.openAt}
                  onChange={(e) => setForm((prev) => ({ ...prev, openAt: e.target.value }))}
                />
              </label>
              <label className="admin-field">
                <span>结束时间</span>
                <input
                  type="datetime-local"
                  value={form.closeAt}
                  onChange={(e) => setForm((prev) => ({ ...prev, closeAt: e.target.value }))}
                />
              </label>
            </div>
            <label className="admin-field">
              <span>课表确认截止（可选）</span>
              <input
                type="datetime-local"
                value={form.confirmDeadline}
                onChange={(e) => setForm((prev) => ({ ...prev, confirmDeadline: e.target.value }))}
              />
            </label>
            <button type="button" className="btn primary" disabled={saving} onClick={() => void savePeriod()}>
              {saving ? "保存中…" : "保存配置"}
            </button>
          </section>

          <section className="card admin-section-card">
            <h2>手动加退课</h2>
            <p className="muted">用于处理补录、误选修正等特殊情况。操作会绕过选课窗口限制。</p>
            <label className="admin-field">
              <span>学生用户 ID</span>
              <input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="User UUID" />
            </label>
            <label className="admin-field">
              <span>课程 ID</span>
              <input value={courseId} onChange={(e) => setCourseId(e.target.value)} placeholder="Course UUID" />
            </label>
            <div className="admin-actions">
              <button
                type="button"
                className="btn primary"
                disabled={manualBusy !== null}
                onClick={() => void manual("enroll")}
              >
                {manualBusy === "enroll" ? "加课中…" : "手动加课"}
              </button>
              <button
                type="button"
                className="btn"
                disabled={manualBusy !== null}
                onClick={() => void manual("drop")}
              >
                {manualBusy === "drop" ? "退课中…" : "手动退课"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
