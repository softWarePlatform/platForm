import { useEffect, useMemo, useState } from "react";
import { api } from "../../api/client";
import AdminLayout from "./AdminLayout";
import styles from "./admin.module.css";

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
  emailVerifiedAt: string | null;
};

type EnrollmentPeriodForm = {
  label: string;
  phase: "PRESELECT" | "FORMAL" | "ADD_DROP" | "CLOSED";
  openAt: string;
  closeAt: string;
  confirmDeadline: string;
};

export default function AdminUsers() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loadingLogsFor, setLoadingLogsFor] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminActionBusy, setAdminActionBusy] = useState<string | null>(null);
  const [adminUserId, setAdminUserId] = useState("");
  const [adminCourseId, setAdminCourseId] = useState("");
  const [periodForm, setPeriodForm] = useState<EnrollmentPeriodForm>({
    label: "",
    phase: "FORMAL",
    openAt: "",
    closeAt: "",
    confirmDeadline: "",
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/admin/users");
        if (!cancelled) setRows(data.users ?? []);
      } catch {
        if (!cancelled) setErr("无权查看（仅管理员）");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/enrollment/period");
        const period = data.period;
        if (!cancelled) {
          if (period) {
            setPeriodForm({
              label: period.label ?? data.semester.label,
              phase: period.phase,
              openAt: new Date(period.openAt).toISOString().slice(0, 16),
              closeAt: new Date(period.closeAt).toISOString().slice(0, 16),
              confirmDeadline: period.confirmDeadline ? new Date(period.confirmDeadline).toISOString().slice(0, 16) : "",
            });
          } else {
            const now = new Date();
            setPeriodForm({
              label: data.semester.label,
              phase: "FORMAL",
              openAt: new Date(now.getTime() - 24 * 3600 * 1000).toISOString().slice(0, 16),
              closeAt: new Date(now.getTime() + 7 * 24 * 3600 * 1000).toISOString().slice(0, 16),
              confirmDeadline: "",
            });
          }
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const subtitle = useMemo(() => `${rows.length} 个用户`, [rows.length]);

  async function openLogs(user: UserRow) {
    setLoadingLogsFor(user.id);
    window.location.href = `/admin/users/${user.id}/logs`;
  }

  async function deleteUser(user: UserRow) {
    const ok = window.confirm(`确认删除用户 ${user.name}（${user.email}）吗？此操作不可撤销。`);
    if (!ok) return;
    setActionBusy(user.id);
    try {
      await api.delete(`/admin/users/${user.id}`);
      setRows((prev) => prev.filter((item) => item.id !== user.id));
    } catch (e: any) {
      setErr(e?.response?.data?.error ?? "删除失败");
    } finally {
      setActionBusy(null);
    }
  }

  const savePeriod = async () => {
    setAdminBusy(true);
    setErr(null);
    try {
      await api.put("/enrollment/period", {
        label: periodForm.label,
        phase: periodForm.phase,
        openAt: periodForm.openAt,
        closeAt: periodForm.closeAt,
        confirmDeadline: periodForm.confirmDeadline || null,
      });
      setErr(null);
    } catch (e) {
      setErr((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "保存失败");
    } finally {
      setAdminBusy(false);
    }
  };

  const adminEnroll = async () => {
    if (!adminUserId || !adminCourseId) {
      setErr("请填写用户ID和课程ID");
      return;
    }
    setAdminActionBusy("enroll");
    try {
      await api.post("/enrollment/admin/enroll", { userId: adminUserId, courseId: adminCourseId });
      setErr(null);
    } catch (e) {
      setErr((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "手动加课失败");
    } finally {
      setAdminActionBusy(null);
    }
  };

  const adminDrop = async () => {
    if (!adminUserId || !adminCourseId) {
      setErr("请填写用户ID和课程ID");
      return;
    }
    const ok = window.confirm("确认执行手动退课吗？");
    if (!ok) return;
    setAdminActionBusy("drop");
    try {
      await api.post("/enrollment/admin/drop", { userId: adminUserId, courseId: adminCourseId });
      setErr(null);
    } catch (e) {
      setErr((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "手动退课失败");
    } finally {
      setAdminActionBusy(null);
    }
  };

  return (
    <AdminLayout title="用户管理" subtitle={subtitle}>
      {err ? <div className="page-alert page-alert--warn">{err}</div> : null}

      <div className={styles.usersWorkspace}>
        <section className={styles.card}>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>姓名</th>
                  <th>邮箱</th>
                  <th>角色</th>
                  <th>验证</th>
                  <th>注册时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="data-table__primary">{u.name}</div>
                    </td>
                    <td className="data-table__muted">{u.email}</td>
                    <td>{u.role}</td>
                    <td>{u.emailVerifiedAt ? "已验证" : "未验证"}</td>
                    <td className="data-table__muted">{new Date(u.createdAt).toLocaleDateString()}</td>
                    <td>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button className="btn" type="button" onClick={() => openLogs(u)} disabled={loadingLogsFor === u.id}>
                          {loadingLogsFor === u.id ? "加载中" : "查看日志"}
                        </button>
                        <button className="btn danger" type="button" onClick={() => deleteUser(u)} disabled={actionBusy === u.id}>
                          {actionBusy === u.id ? "删除中" : "删除"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.quickTitle}>当前学期选课阶段与时段</div>
          <div className={styles.quickDesc}>保存后立即生效，会直接影响全站选课开放状态与前台可见性。</div>
          <div className={styles.quickDesc} style={{ color: "#b45309" }}>
            风险提示：修改时段/阶段会影响所有学生的选课、退课和课表确认，请确认后再保存。
          </div>

          <div className="form-grid" style={{ marginTop: 12 }}>
            <label className="form-field">
              <span>学期名称</span>
              <input value={periodForm.label} onChange={(e) => setPeriodForm((p) => ({ ...p, label: e.target.value }))} />
            </label>
            <label className="form-field">
              <span>阶段</span>
              <select value={periodForm.phase} onChange={(e) => setPeriodForm((p) => ({ ...p, phase: e.target.value as EnrollmentPeriodForm["phase"] }))}>
                <option value="PRESELECT">预选课</option>
                <option value="FORMAL">正选</option>
                <option value="ADD_DROP">补退选</option>
                <option value="CLOSED">已关闭</option>
              </select>
            </label>
            <label className="form-field">
              <span>开始时间</span>
              <input type="datetime-local" value={periodForm.openAt} onChange={(e) => setPeriodForm((p) => ({ ...p, openAt: e.target.value }))} />
            </label>
            <label className="form-field">
              <span>结束时间</span>
              <input type="datetime-local" value={periodForm.closeAt} onChange={(e) => setPeriodForm((p) => ({ ...p, closeAt: e.target.value }))} />
            </label>
            <label className="form-field">
              <span>确认截止时间（可选）</span>
              <input type="datetime-local" value={periodForm.confirmDeadline} onChange={(e) => setPeriodForm((p) => ({ ...p, confirmDeadline: e.target.value }))} />
            </label>
          </div>

          <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" className="btn primary" onClick={savePeriod} disabled={adminBusy}>
              {adminBusy ? "保存中…" : "保存并立即生效"}
            </button>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.quickTitle}>特殊情况手动加退课</div>
          <div className={styles.quickDesc}>仅用于特殊审批场景，操作会立即生效并写入选课日志。</div>
          <div className="form-grid" style={{ marginTop: 12 }}>
            <label className="form-field">
              <span>用户ID</span>
              <input value={adminUserId} onChange={(e) => setAdminUserId(e.target.value)} placeholder="输入用户 UUID" />
            </label>
            <label className="form-field">
              <span>课程ID</span>
              <input value={adminCourseId} onChange={(e) => setAdminCourseId(e.target.value)} placeholder="输入课程 UUID" />
            </label>
          </div>
          <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" className="btn primary" onClick={adminEnroll} disabled={adminActionBusy === "enroll"}>
              {adminActionBusy === "enroll" ? "加课中…" : "手动加课"}
            </button>
            <button type="button" className="btn danger" onClick={adminDrop} disabled={adminActionBusy === "drop"}>
              {adminActionBusy === "drop" ? "退课中…" : "手动退课"}
            </button>
          </div>
        </section>
      </div>
    </AdminLayout>
  );
}
