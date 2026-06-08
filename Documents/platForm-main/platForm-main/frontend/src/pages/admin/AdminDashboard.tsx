import { useEffect, useState } from "react";
import { api } from "../../api/client";
import AdminLayout from "./AdminLayout";
import styles from "./admin.module.css";

type DashboardData = {
  stats?: {
    registeredUsers?: number;
    courses?: number;
    currentSemesterLabs?: number;
    electionStatus?: string;
  };
  semester?: string;
  schedule?: {
    openAt?: string;
    closeAt?: string;
    confirmDeadline?: string;
  };
};

function fmtDate(value?: string) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardData>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get<DashboardData>("/admin/dashboard");
        if (!cancelled) setData(data);
      } catch {
        if (!cancelled) setError("当前仅展示前端静态布局，后台概览接口暂不可用。");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = [
    { label: "注册用户", value: data.stats?.registeredUsers ?? 4, meta: "学生 2 · 教师 1 · 管理员 1" },
    { label: "课程总数", value: data.stats?.courses ?? 3, meta: "已发布 3 · 本学期 3" },
    { label: "本学期选课", value: data.stats?.currentSemesterLabs ?? 5, meta: "人次（含重复选多门）" },
    { label: "选课阶段", value: data.stats?.electionStatus ?? "正选", meta: "当前在开放时段内" },
  ];

  return (
    <AdminLayout title="管理控制台" subtitle={`超级管理员 · 演示管理台 · ${data.semester ?? "2026 - 2027 春学期"}`}>
      {error ? <div className="page-alert page-alert--warn">{error}</div> : null}

      <div className={styles.stats}>
        {stats.map((item) => (
          <article key={item.label} className={styles.stat}>
            <div className={styles.statLabel}>{item.label}</div>
            <div className={styles.statValue}>{item.value}</div>
            <div className={styles.statMeta}>{item.meta}</div>
          </article>
        ))}
      </div>

      <section className={styles.banner}>
        <div className={styles.bannerLabel}>选课时段 · 2026 - 2027 春学期</div>
        <div className={styles.bannerMeta}>
          开放：{fmtDate(data.schedule?.openAt ?? "2026-05-25T08:41:15")} — {fmtDate(data.schedule?.closeAt ?? "2026-07-31T08:41:15")} ·
          确认截止：{fmtDate(data.schedule?.confirmDeadline ?? "2026-08-30T08:41:15")}
        </div>
      </section>

      <h2 className={styles.sectionTitle}>快捷入口</h2>
      <div className={styles.quickGrid}>
        <article className={styles.quick}>
          <div className={styles.quickTitle}>用户管理</div>
          <div className={styles.quickDesc}>查看全部用户、角色与邮箱验证状态</div>
        </article>
        <article className={styles.quick}>
          <div className={styles.quickTitle}>选课配置</div>
          <div className={styles.quickDesc}>设置选课阶段、时段、手动追退与容量</div>
        </article>
        <article className={styles.quick}>
          <div className={styles.quickTitle}>课程运维</div>
          <div className={styles.quickDesc}>调整课程容量与选课相关字段</div>
        </article>
        <article className={styles.quick}>
          <div className={styles.quickTitle}>教学台预览</div>
          <div className={styles.quickDesc}>以管理员身份查看全站课程与教学模块</div>
        </article>
      </div>
    </AdminLayout>
  );
}
