import { useEffect, useState } from "react";
import { api } from "../api/client";

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
        if (!cancelled) setErr("无权查看用户列表（仅管理员）");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="container">
      <h2 style={{ marginTop: 10 }}>管理员：用户列表</h2>
      {err ? <div className="err">{err}</div> : null}
      <div className="card" style={{ marginTop: 14, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid var(--border)" }}>姓名</th>
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid var(--border)" }}>邮箱</th>
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid var(--border)" }}>角色</th>
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid var(--border)" }}>邮箱状态</th>
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid var(--border)" }}>创建时间</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td style={{ padding: 10, borderBottom: "1px solid var(--border)" }}>{u.name}</td>
                <td style={{ padding: 10, borderBottom: "1px solid var(--border)" }}>{u.email}</td>
                <td style={{ padding: 10, borderBottom: "1px solid var(--border)" }}>{u.role}</td>
                <td style={{ padding: 10, borderBottom: "1px solid var(--border)" }}>
                  {u.emailVerifiedAt ? "已验证" : "未验证"}
                </td>
                <td style={{ padding: 10, borderBottom: "1px solid var(--border)" }}>
                  {new Date(u.createdAt).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!err && rows.length === 0 ? <div className="muted" style={{ padding: 10 }}>暂无数据</div> : null}
      </div>
    </div>
  );
}

