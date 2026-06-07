import { useEffect, useState } from "react";
import { api } from "../api/client";
import EmptyState from "../components/layout/EmptyState";
import PageHeader from "../components/layout/PageHeader";
import PageShell from "../components/layout/PageShell";
import StatusBadge from "../components/layout/StatusBadge";

export default function AdminUsers() {
  const [rows, setRows] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);

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

  return (
    <PageShell>
      <PageHeader title="用户管理" lead={`${rows.length} 个用户`} />

      {err ? <div className="page-alert err">{err}</div> : null}

      <section className="panel panel--accent">
        {rows.length === 0 && !err ? (
          <EmptyState title="暂无用户" />
        ) : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>姓名</th>
                  <th>邮箱</th>
                  <th>角色</th>
                  <th>邮箱</th>
                  <th>注册</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="data-table__primary">{u.name}</div>
                    </td>
                    <td className="data-table__muted">{u.email}</td>
                    <td>
                      <StatusBadge tone="brand">{u.role}</StatusBadge>
                    </td>
                    <td>
                      <StatusBadge tone={u.emailVerifiedAt ? "ok" : "muted"}>
                        {u.emailVerifiedAt ? "已验证" : "未验证"}
                      </StatusBadge>
                    </td>
                    <td className="data-table__muted">{new Date(u.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </PageShell>
  );
}
