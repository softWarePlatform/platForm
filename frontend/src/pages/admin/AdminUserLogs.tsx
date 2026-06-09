import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api/client";
import AdminLayout from "./AdminLayout";
import styles from "./admin.module.css";

type UserLogsResponse = {
  user: {
    id: string;
    name: string;
    email: string;
    role: "STUDENT" | "TEACHER" | "ADMIN";
  };
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

export default function AdminUserLogs() {
  const { userId } = useParams();
  const [data, setData] = useState<UserLogsResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!userId) return;
    (async () => {
      try {
        const { data } = await api.get<UserLogsResponse>(`/admin/users/${userId}/logs`);
        if (!cancelled) setData(data);
      } catch {
        if (!cancelled) setErr("日志加载失败");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <AdminLayout
      title="用户日志"
      subtitle={data ? `${data.user.name} · ${data.user.email}` : "用户日志详情"}
    >
      <div style={{ marginBottom: 16 }}>
        <Link className="btn" to="/admin/users">
          返回用户管理
        </Link>
      </div>

      {err ? <div className="page-alert page-alert--warn">{err}</div> : null}

      {data ? (
        <div className={styles.cardGrid}>
          <section className={styles.card}>
            <h3 className={styles.sectionTitle}>选课相关日志</h3>
            {data.logs.enrollment.length ? data.logs.enrollment.map((item) => (
              <div key={item.id} className={styles.quickDesc}>
                {item.createdAt} · {item.action} · {item.courseTitle} {item.note ? `· ${item.note}` : ""}
              </div>
            )) : <div className={styles.quickDesc}>暂无</div>}
          </section>
          <section className={styles.card}>
            <h3 className={styles.sectionTitle}>该用户发布的公告</h3>
            {data.logs.announcements.length ? data.logs.announcements.map((item) => (
              <div key={item.id} className={styles.quickDesc}>
                {item.createdAt} · {item.courseTitle} · {item.title}
              </div>
            )) : <div className={styles.quickDesc}>暂无</div>}
          </section>
          <section className={styles.card}>
            <h3 className={styles.sectionTitle}>站内通知</h3>
            {data.logs.notifications.length ? data.logs.notifications.map((item) => (
              <div key={item.id} className={styles.quickDesc}>
                {item.createdAt} · {item.type} · {item.title}
              </div>
            )) : <div className={styles.quickDesc}>暂无</div>}
          </section>
        </div>
      ) : null}
    </AdminLayout>
  );
}
