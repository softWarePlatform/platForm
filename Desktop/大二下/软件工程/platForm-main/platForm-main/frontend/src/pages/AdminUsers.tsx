import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import EmptyState from "../components/layout/EmptyState";
import PageHeader from "../components/layout/PageHeader";
import PageShell from "../components/layout/PageShell";
import StatusBadge from "../components/layout/StatusBadge";

type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: "STUDENT" | "TEACHER" | "ADMIN";
  emailVerifiedAt: string | null;
  createdAt: string;
};

const roleLabel: Record<AdminUser["role"], string> = {
  STUDENT: "学生",
  TEACHER: "教师",
  ADMIN: "管理员",
};

export default function AdminUsers() {
  const [rows, setRows] = useState<AdminUser[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [roleFilter, setRoleFilter] = useState<"ALL" | AdminUser["role"]>("ALL");

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
    return {
      total: rows.length,
      admins: rows.filter((u) => u.role === "ADMIN").length,
      teachers: rows.filter((u) => u.role === "TEACHER").length,
      students: rows.filter((u) => u.role === "STUDENT").length,
      verified,
      unverified: rows.length - verified,
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
                <select className="input" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as typeof roleFilter)}>
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
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((u) => (
                        <tr key={u.id}>
                          <td>
                            <div className="data-table__primary">{u.name}</div>
                            <div className="data-table__sub">{u.email}</div>
                          </td>
                          <td>
                            <StatusBadge tone={u.role === "ADMIN" ? "brand" : u.role === "TEACHER" ? "ok" : "muted"}>
                              {roleLabel[u.role]}
                            </StatusBadge>
                          </td>
                          <td>
                            <StatusBadge tone={u.emailVerifiedAt ? "ok" : "warn"}>
                              {u.emailVerifiedAt ? "已验证" : "未验证"}
                            </StatusBadge>
                          </td>
                          <td className="data-table__muted">{new Date(u.createdAt).toLocaleString()}</td>
                        </tr>
                      ))}
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
