import { useEffect, useMemo, useState } from "react";
import { api } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import AdminLayout from "./AdminLayout";
import styles from "./admin.module.css";

type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: "STUDENT" | "TEACHER" | "ADMIN";
  emailVerifiedAt?: string | null;
  createdAt: string;
};

type UserLogsResponse = {
  user: Pick<AdminUser, "id" | "name" | "email" | "role">;
  logs: {
    enrollment: Array<{
      id: string;
      createdAt: string;
      action: string;
      courseId: string;
      courseTitle: string;
      operatorName: string | null;
      note?: string | null;
    }>;
    announcements: Array<{
      id: string;
      createdAt: string;
      title: string;
      courseId: string;
      courseTitle: string;
    }>;
    notifications: Array<{
      id: string;
      createdAt: string;
      title: string;
      body?: string | null;
      type: string;
      readAt?: string | null;
    }>;
  };
};

export default function AdminUsers() {
  const { user: currentUser } = useAuth();
  const [rows, setRows] = useState<AdminUser[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [logs, setLogs] = useState<UserLogsResponse | null>(null);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const adminCount = useMemo(() => rows.filter((u) => u.role === "ADMIN").length, [rows]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get<{ users?: AdminUser[] }>("/admin/users");
        if (!cancelled) setRows(data.users ?? []);
      } catch {
        if (!cancelled) setErr("无权查看（仅管理员）");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadLogs = async (userId: string) => {
    setLoadingLogs(true);
    setErr(null);
    try {
      const { data } = await api.get<UserLogsResponse>(`/admin/users/${userId}/logs`);
      setLogs(data);
      setSelectedUserId(userId);
    } catch {
      setErr("日志加载失败");
    } finally {
      setLoadingLogs(false);
    }
  };

  const deleteUser = async (u: AdminUser) => {
    const isCurrentAdmin = currentUser?.id === u.id;
    const remainingAdmins = u.role === "ADMIN" ? adminCount - 1 : adminCount;
    if (isCurrentAdmin) {
      setErr("不能删除当前登录的管理员账号");
      return;
    }
    if (u.role === "ADMIN" && remainingAdmins < 1) {
      setErr("至少保留一名管理员");
      return;
    }
    if (!window.confirm(`确认删除用户「${u.name}」吗？此操作不可恢复。`)) return;

    setDeletingId(u.id);
    setErr(null);
    try {
      await api.delete(`/admin/users/${u.id}`);
      setRows((prev) => prev.filter((item) => item.id !== u.id));
      if (selectedUserId === u.id) {
        setSelectedUserId(null);
        setLogs(null);
      }
    } catch (e: any) {
      setErr(e?.response?.data?.error ?? "删除失败");
    } finally {
      setDeletingId(null);
    }
  };

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
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id}>
                  <td><div className="data-table__primary">{u.name}</div></td>
                  <td className="data-table__muted">{u.email}</td>
                  <td>{u.role}</td>
                  <td>{u.emailVerifiedAt ? "已验证" : "未验证"}</td>
                  <td className="data-table__muted">{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        className="btn"
                        type="button"
                        onClick={() => void loadLogs(u.id)}
                        disabled={loadingLogs}
                      >
                        查看日志
                      </button>
                      <button
                        className="btn danger"
                        type="button"
                        onClick={() => void deleteUser(u)}
                        disabled={deletingId === u.id || loadingLogs}
                      >
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {logs ? (
        <section className={styles.card} style={{ marginTop: 16 }}>
          <h3 className={styles.sectionTitle}>用户日志：{logs.user.name}</h3>
          <div className={styles.cardGrid}>
            <article className={styles.card}>
              <div className={styles.quickTitle}>选课相关日志</div>
              {logs.logs.enrollment.length ? logs.logs.enrollment.map((item) => (
                <div key={item.id} className={styles.quickDesc}>
                  {item.createdAt} · {item.action} · {item.courseTitle} {item.note ? `· ${item.note}` : ""}
                </div>
              )) : <div className={styles.quickDesc}>暂无</div>}
            </article>
            <article className={styles.card}>
              <div className={styles.quickTitle}>该用户发布的公告</div>
              {logs.logs.announcements.length ? logs.logs.announcements.map((item) => (
                <div key={item.id} className={styles.quickDesc}>{item.createdAt} · {item.courseTitle} · {item.title}</div>
              )) : <div className={styles.quickDesc}>暂无</div>}
            </article>
            <article className={styles.card}>
              <div className={styles.quickTitle}>站内通知</div>
              {logs.logs.notifications.length ? logs.logs.notifications.map((item) => (
                <div key={item.id} className={styles.quickDesc}>{item.createdAt} · {item.type} · {item.title}</div>
              )) : <div className={styles.quickDesc}>暂无</div>}
            </article>
          </div>
        </section>
      ) : null}
    </AdminLayout>
  );
}
