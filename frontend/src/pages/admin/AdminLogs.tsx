import { useEffect, useState } from "react";
import { api } from "../../api/client";
import AdminLayout from "./AdminLayout";

type AdminLogItem = {
  id: string;
  type: string;
  title: string;
  detail: string;
  createdAt: string;
};

type AdminUserLogsResponse = {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  logs: AdminLogItem[];
};

export default function AdminLogs() {
  const [data, setData] = useState<AdminUserLogsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await api.get<{ user: { id: string } }>("/auth/me");
        const { data } = await api.get<AdminUserLogsResponse>(`/admin/users/${me.data.user.id}/logs`);
        if (!cancelled) setData(data);
      } catch {
        if (!cancelled) setError("日志列表加载失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AdminLayout title="管理员操作日志" subtitle="查看后台配置、用户与课程运维中的关键操作记录">
      <section className="card" style={{ padding: 18 }}>
        <div style={{ fontWeight: 800 }}>管理员操作日志</div>
        <div className="muted" style={{ marginTop: 8 }}>
          后端接口已接入，当前展示管理员自己的操作日志汇总。
        </div>
      </section>

      {error ? <div className="page-alert page-alert--warn" style={{ marginTop: 16 }}>{error}</div> : null}

      <section className="card" style={{ padding: 18, marginTop: 16 }}>
        {loading ? (
          <div className="muted">加载中…</div>
        ) : data ? (
          <>
            <div style={{ fontWeight: 800, marginBottom: 10 }}>
              {data.user.name} · {data.user.email}
            </div>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>时间</th>
                    <th>类型</th>
                    <th>标题</th>
                    <th>详情</th>
                  </tr>
                </thead>
                <tbody>
                  {data.logs.map((item) => (
                    <tr key={item.id}>
                      <td>{new Date(item.createdAt).toLocaleString("zh-CN")}</td>
                      <td>{item.type}</td>
                      <td>{item.title}</td>
                      <td>{item.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="muted">暂无日志</div>
        )}
      </section>
    </AdminLayout>
  );
}
