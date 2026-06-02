import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";

type AdminUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
  emailVerifiedAt: string | null;
};

const ROLE_LABEL: Record<string, string> = {
  STUDENT: "学生",
  TEACHER: "教师",
  ADMIN: "超级管理员",
};

export default function AdminUsers() {
  const { user: me } = useAuth();
  const [rows, setRows] = useState<AdminUser[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    const { data } = await api.get<{ users: AdminUser[] }>("/admin/users");
    setRows(data.users ?? []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await load();
      } catch {
        if (!cancelled) setErr("无权查看用户列表（仅超级管理员）");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function deleteUser(u: AdminUser) {
    if (u.id === me?.id) {
      setErr("不能删除自己的账号");
      return;
    }
    const label = `${u.name}（${u.email}）`;
    if (!window.confirm(`确定删除用户 ${label}？\n\n该操作不可恢复，其选课、提交等关联数据将一并删除。`)) {
      return;
    }

    setErr(null);
    setOkMsg(null);
    setBusyId(u.id);
    try {
      await api.delete(`/admin/users/${u.id}`);
      setOkMsg(`已删除用户 ${label}`);
      await load();
    } catch (e: unknown) {
      const msg =
        typeof e === "object" && e !== null && "response" in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : null;
      setErr(msg ?? "删除失败");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <header className="admin-page-header">
        <h1>用户管理</h1>
        <p className="muted" style={{ margin: 0 }}>
          查看与删除全站注册用户（不可删除自己、末位超级管理员及仍授课的教师）
        </p>
      </header>
      {err ? <div className="err">{err}</div> : null}
      {okMsg ? <span className="save-ok" style={{ display: "block", marginBottom: 10 }}>{okMsg}</span> : null}
      <div className="card" style={{ marginTop: 14, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid var(--border)" }}>姓名</th>
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid var(--border)" }}>邮箱</th>
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid var(--border)" }}>角色</th>
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid var(--border)" }}>邮箱状态</th>
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid var(--border)" }}>创建时间</th>
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid var(--border)" }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => {
              const isSelf = u.id === me?.id;
              const deleting = busyId === u.id;
              return (
                <tr key={u.id}>
                  <td style={{ padding: 10, borderBottom: "1px solid var(--border)" }}>
                    {u.name}
                    {isSelf ? <span className="muted">（当前账号）</span> : null}
                  </td>
                  <td style={{ padding: 10, borderBottom: "1px solid var(--border)" }}>{u.email}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid var(--border)" }}>
                    {ROLE_LABEL[u.role] ?? u.role}
                  </td>
                  <td style={{ padding: 10, borderBottom: "1px solid var(--border)" }}>
                    {u.emailVerifiedAt ? "已验证" : "未验证"}
                  </td>
                  <td style={{ padding: 10, borderBottom: "1px solid var(--border)" }}>
                    {new Date(u.createdAt).toLocaleString()}
                  </td>
                  <td style={{ padding: 10, borderBottom: "1px solid var(--border)" }}>
                    <button
                      type="button"
                      className="btn"
                      disabled={isSelf || deleting || busyId !== null}
                      style={isSelf ? undefined : { color: "var(--danger)", borderColor: "#fecaca" }}
                      onClick={() => void deleteUser(u)}
                    >
                      {deleting ? "删除中…" : "删除"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!err && rows.length === 0 ? <div className="muted" style={{ padding: 10 }}>暂无数据</div> : null}
      </div>
    </>
  );
}
