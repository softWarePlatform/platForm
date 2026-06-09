import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import EmptyState from "../components/layout/EmptyState";
import PageHeader from "../components/layout/PageHeader";
import PageShell from "../components/layout/PageShell";
import StatusBadge from "../components/layout/StatusBadge";
import { useConfirm } from "../components/ui/ConfirmDialog";

type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: "STUDENT" | "TEACHER" | "ADMIN";
  emailVerifiedAt: string | null;
  createdAt: string;
  disabledAt?: string | null;
};

const roleLabel: Record<AdminUser["role"], string> = {
  STUDENT: "学生",
  TEACHER: "教师",
  ADMIN: "管理员",
};

const roleTone: Record<AdminUser["role"], "brand" | "ok" | "muted"> = {
  ADMIN: "brand",
  TEACHER: "ok",
  STUDENT: "muted",
};

export default function AdminUsers() {
  const { user: me } = useAuth();
  const confirm = useConfirm();
  const [rows, setRows] = useState<AdminUser[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [roleFilter, setRoleFilter] = useState<"ALL" | AdminUser["role"]>("ALL");
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadUsers = async () => {
    setLoading(true);
    setErr(null);
    try {
      const { data } = await api.get("/admin/users");
      setRows((data.users ?? []) as AdminUser[]);
    } catch {
      setErr("无权查看或接口请求失败（仅管理员可访问）");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const stats = useMemo(() => {
    const verified = rows.filter((u) => Boolean(u.emailVerifiedAt)).length;
    const frozen = rows.filter((u) => Boolean(u.disabledAt)).length;
    return {
      total: rows.length,
      admins: rows.filter((u) => u.role === "ADMIN").length,
      teachers: rows.filter((u) => u.role === "TEACHER").length,
      students: rows.filter((u) => u.role === "STUDENT").length,
      verified,
      unverified: rows.length - verified,
      frozen,
    };
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return rows.filter((u) => {
      const matchRole = roleFilter === "ALL" ? true : u.role === roleFilter;
      const matchKeyword =
        q.length === 0 ||
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q);
      return matchRole && matchKeyword;
    });
  }, [keyword, roleFilter, rows]);

  const runAction = async (user: AdminUser, action: "freeze" | "delete" | "reset" | "role") => {
    setBusyId(user.id);
    setErr(null);
    try {
      if (action === "freeze") {
        const frozen = !user.disabledAt;
        const ok = await confirm.confirm({
          title: frozen ? "冻结用户" : "解除冻结",
          message: `${frozen ? "确定冻结" : "确定解除冻结"}「${user.name}」吗？`,
          confirmLabel: frozen ? "冻结" : "解除冻结",
          danger: true,
        });
        if (!ok) return;
        await api.patch(`/admin/users/${user.id}/freeze`, { frozen });
      } else if (action === "delete") {
        const ok = await confirm.confirm({
          title: "删除用户",
          message: `确定删除「${user.name}」吗？此操作不可撤销。`,
          confirmLabel: "删除",
          danger: true,
        });
        if (!ok) return;
        await api.delete(`/admin/users/${user.id}`);
      } else if (action === "reset") {
        const newPassword = window.prompt(`输入「${user.name}」的新密码（留空则自动生成）`);
        const ok = await confirm.confirm({
          title: "重置密码",
          message: `确定重置「${user.name}」的密码吗？`,
          confirmLabel: "重置",
          danger: true,
        });
        if (!ok) return;
        const { data } = await api.post(`/admin/users/${user.id}/reset-password`, newPassword ? { newPassword } : {});
        window.alert(data.tempPassword ? `临时密码：${data.tempPassword}` : "密码已重置");
      } else {
        const next: AdminUser["role"] =
          user.role === "ADMIN" ? "TEACHER" : user.role === "TEACHER" ? "STUDENT" : "TEACHER";
        const ok = await confirm.confirm({
          title: "调整角色",
          message: `将「${user.name}」角色改为「${roleLabel[next]}」？`,
          confirmLabel: "确认",
        });
        if (!ok) return;
        await api.patch(`/admin/users/${user.id}/role`, { role: next });
      }
      await loadUsers();
    } catch {
      setErr("操作失败，请检查后端接口或权限");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <PageShell>
      <div className="admin-console">
        <PageHeader
          title="超级管理员控制台"
          lead="统一查看全站账号、快速筛选角色，并跟踪账号验证状态"
          actions={
            <button className="btn primary" type="button" onClick={() => void loadUsers()} disabled={loading}>
              {loading ? "刷新中…" : "刷新数据"}
            </button>
          }
          below={
            <div className="admin-console__stats">
              <div className="admin-console__stat-card">
                <span className="admin-console__stat-label">总用户</span>
                <strong>{stats.total}</strong>
              </div>
              <div className="admin-console__stat-card">
                <span className="admin-console__stat-label">管理员</span>
                <strong>{stats.admins}</strong>
              </div>
              <div className="admin-console__stat-card">
                <span className="admin-console__stat-label">教师</span>
                <strong>{stats.teachers}</strong>
              </div>
              <div className="admin-console__stat-card">
                <span className="admin-console__stat-label">学生</span>
                <strong>{stats.students}</strong>
              </div>
              <div className="admin-console__stat-card admin-console__stat-card--good">
                <span className="admin-console__stat-label">已验证</span>
                <strong>{stats.verified}</strong>
              </div>
              <div className="admin-console__stat-card admin-console__stat-card--warn">
                <span className="admin-console__stat-label">未验证</span>
                <strong>{stats.unverified}</strong>
              </div>
              <div className="admin-console__stat-card">
                <span className="admin-console__stat-label">冻结</span>
                <strong>{stats.frozen}</strong>
              </div>
            </div>
          }
        />

        {err ? <div className="page-alert err">{err}</div> : null}

        <div className="admin-console__layout">
          <aside className="admin-console__sidebar">
            <section className="panel panel--accent admin-console__panel">
              <div className="panel__head">
                <h2 className="panel__title">筛选面板</h2>
              </div>
              <div className="panel__body grid" style={{ gap: 12 }}>
                <input
                  className="input"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="搜索姓名、邮箱或角色"
                />
                <select
                  className="input"
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value as typeof roleFilter)}
                >
                  <option value="ALL">全部角色</option>
                  <option value="ADMIN">管理员</option>
                  <option value="TEACHER">教师</option>
                  <option value="STUDENT">学生</option>
                </select>
                <div className="admin-console__hint">
                  当前显示 <strong>{filteredRows.length}</strong> / {rows.length} 条用户记录
                </div>
                <div className="admin-console__legend">
                  <div className="admin-console__legend-item">
                    <span className="admin-console__legend-dot admin-console__legend-dot--brand" />
                    超级管理账号
                  </div>
                  <div className="admin-console__legend-item">
                    <span className="admin-console__legend-dot admin-console__legend-dot--good" />
                    已完成邮箱验证
                  </div>
                  <div className="admin-console__legend-item">
                    <span className="admin-console__legend-dot admin-console__legend-dot--warn" />
                    待验证账号
                  </div>
                </div>
              </div>
            </section>
          </aside>

          <main className="admin-console__content">
            <section className="panel panel--accent admin-console__panel">
              <div className="panel__head">
                <h2 className="panel__title">用户列表</h2>
                <span className="muted" style={{ fontSize: 13 }}>
                  管理台视图 · 只读
                </span>
              </div>

              {loading ? (
                <div className="panel__body muted">正在加载用户列表…</div>
              ) : filteredRows.length === 0 ? (
                <EmptyState title={rows.length === 0 ? "暂无用户" : "没有符合条件的用户"}>
                  {rows.length === 0 ? null : (
                    <button
                      className="btn"
                      type="button"
                      onClick={() => {
                        setKeyword("");
                        setRoleFilter("ALL");
                      }}
                    >
                      清除筛选
                    </button>
                  )}
                </EmptyState>
              ) : (
                <div className="data-table-wrap admin-console__table-wrap">
                  <table className="data-table admin-console__table">
                    <thead>
                      <tr>
                        <th>用户</th>
                        <th>角色</th>
                        <th>邮箱状态</th>
                        <th>注册时间</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((u) => {
                        const isMe = me?.id === u.id;
                        const adminCount = rows.filter((x) => x.role === "ADMIN").length;
                        return (
                          <tr key={u.id}>
                            <td>
                              <div className="data-table__primary">{u.name}</div>
                              <div className="data-table__sub">{u.email}</div>
                            </td>
                            <td>
                              <StatusBadge tone={roleTone[u.role]}>{roleLabel[u.role]}</StatusBadge>
                              {u.disabledAt ? (
                                <div style={{ marginTop: 6 }}>
                                  <StatusBadge tone="warn">已冻结</StatusBadge>
                                </div>
                              ) : null}
                            </td>
                            <td>
                              <StatusBadge tone={u.emailVerifiedAt ? "ok" : "warn"}>
                                {u.emailVerifiedAt ? "已验证" : "未验证"}
                              </StatusBadge>
                            </td>
                            <td className="data-table__muted">{new Date(u.createdAt).toLocaleString()}</td>
                            <td className="data-table__actions">
                              <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
                                <button
                                  className="btn btn--sm"
                                  type="button"
                                  onClick={() => void runAction(u, "role")}
                                  disabled={busyId === u.id || isMe}
                                >
                                  调角色
                                </button>
                                <button
                                  className="btn btn--sm"
                                  type="button"
                                  onClick={() => void runAction(u, "reset")}
                                  disabled={busyId === u.id}
                                >
                                  重置密码
                                </button>
                                <button
                                  className="btn btn--sm"
                                  type="button"
                                  onClick={() => void runAction(u, "freeze")}
                                  disabled={busyId === u.id || isMe}
                                >
                                  {u.disabledAt ? "解除冻结" : "冻结"}
                                </button>
                                <button
                                  className="btn btn--sm btn--danger"
                                  type="button"
                                  onClick={() => void runAction(u, "delete")}
                                  disabled={busyId === u.id || isMe || (u.role === "ADMIN" && adminCount <= 1)}
                                >
                                  删除
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </main>
        </div>
      </div>
    </PageShell>
  );
}
