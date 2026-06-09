import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api/client";
import AdminLayout from "./AdminLayout";
import styles from "./admin.module.css";

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: string;
};

type UserLog = {
  id: string;
  type: string;
  title: string;
  detail: string;
  createdAt: string;
};

export default function AdminUserLogs() {
  const { userId } = useParams();
  const [user, setUser] = useState<UserRow | null>(null);
  const [logs, setLogs] = useState<UserLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const { data } = await api.get(`/admin/users/${userId}/logs`);
        if (!cancelled) {
          setUser(data.user ?? null);
          setLogs(data.logs ?? []);
        }
      } catch (e: any) {
        if (!cancelled) setErr(e?.response?.data?.error ?? "用户日志加载失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <AdminLayout
      title="用户日志"
      subtitle={user ? `${user.name} · ${user.email}` : "查看指定用户的操作日志"}
    >
      <div className={styles.logsPageToolbar}>
        <Link to="/admin/users" className="btn">
          返回用户管理
        </Link>
        {user ? <span className={styles.logDrawerBadge}>{logs.length} 条日志</span> : null}
      </div>

      {err ? <div className="page-alert page-alert--warn">{err}</div> : null}

      <section className={styles.card}>
        {loading ? (
          <div className="muted">加载中…</div>
        ) : logs.length === 0 ? (
          <div className="muted">暂无日志</div>
        ) : (
          <div className={styles.logTimeline}>
            {logs.map((log) => (
              <article key={log.id} className={styles.logItem}>
                <div className={styles.logDot} />
                <div className={styles.logContent}>
                  <div className={styles.logTitle}>{log.title}</div>
                  <div className={styles.logDetail}>{log.detail}</div>
                  <div className={styles.logTime}>{new Date(log.createdAt).toLocaleString("zh-CN", { hour12: false })}</div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </AdminLayout>
  );
}
