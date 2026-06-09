import { useEffect, useState } from "react";
import { api } from "../../api/client";
import AdminLayout from "./AdminLayout";
import styles from "./admin.module.css";

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
    <AdminLayout title="用户管理" subtitle={`${rows.length} 个用户`}>
      {err ? <div className="page-alert page-alert--warn">{err}</div> : null}

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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AdminLayout>
  );
}
