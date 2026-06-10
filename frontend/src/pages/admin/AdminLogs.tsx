import { useEffect, useState } from "react";
import { api } from "../../api/client";
import AdminLayout from "./AdminLayout";
import styles from "./admin.module.css";

type UnifiedLogItem = {
  id: string;
  time: string;
  type: string;
  title: string;
  detail: string;
};

type LogsResponse = {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  } | null;
  logs: UnifiedLogItem[];
};

function fmt(value: string) {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

export default function AdminLogs() {
  const [data, setData] = useState<LogsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const { data } = await api.get<LogsResponse>("/admin/audit");
        if (!cancelled) setData(data);
      } catch {
        if (!cancelled) setErr("加载管理员日志失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AdminLayout title="管理员操作日志" subtitle="仅查看管理员本人操作记录">
      {err ? <div className="page-alert page-alert--warn">{err}</div> : null}
      {loading ? <div className="page-alert">加载日志中...</div> : null}

      <section className={styles.panel}>
        <div className={styles.sectionHeader}>
          <div>
            <h3 className={styles.sectionTitle}>管理员审计中心</h3>
            <p className={styles.sectionSubtitle}>汇总所有管理员高风险操作记录，包括删除用户等动作。</p>
          </div>
          <span className={styles.sectionTag}>后端接口 /admin/audit</span>
        </div>
      </section>

      {data ? (
        <section className={styles.panel} style={{ marginTop: 16 }}>
          <div className={styles.sectionHeader}>
            <div>
              <h3 className={styles.sectionTitle}>操作明细</h3>
              <p className={styles.sectionSubtitle}>展示时间、类型、标题和详情。</p>
            </div>
          </div>
          <div className={styles.adminLogTableWrap}>
            <table className={styles.adminLogTable}>
              <thead>
                <tr>
                  <th>时间</th>
                  <th>类型</th>
                  <th>标题</th>
                  <th>详情</th>
                </tr>
              </thead>
              <tbody>
                {data.logs.length ? data.logs.map((item) => (
                  <tr key={item.id}>
                    <td>{fmt(item.time)}</td>
                    <td><span className={styles.logPill}>{item.type}</span></td>
                    <td>{item.title}</td>
                    <td className={styles.logDetailCell}>{item.detail}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={4}><div className={styles.emptyState}>暂无日志</div></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </AdminLayout>
  );
}
