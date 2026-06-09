import { useEffect, useMemo, useState } from "react";
import { api } from "../../api/client";
import AdminLayout from "./AdminLayout";
import styles from "./admin.module.css";

type DashboardData = {
  semester?: { key: string; label: string };
  stats?: {
    registeredUsers?: number;
    teacherCount?: number;
    studentCount?: number;
    adminCount?: number;
    courseCount?: number;
    publishedCourseCount?: number;
    currentSemesterCourseCount?: number;
    enrollmentCount?: number;
    labSetCount?: number;
    homeworkCount?: number;
    enrollmentPhase?: string;
  };
  schedule?: {
    openAt?: string | null;
    closeAt?: string | null;
    confirmDeadline?: string | null;
  } | null;
  recentPeriods?: Array<{
    semesterKey: string;
    label: string;
    phase: string;
    openAt: string;
    closeAt: string;
    confirmDeadline?: string | null;
  }>;
};

function fmtDate(value?: string | null) {
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
        if (!cancelled) setError("后台概览接口暂不可用。");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(
    () => [
      { label: "注册用户数", value: data.stats?.registeredUsers ?? "-" },
      { label: "教师数", value: data.stats?.teacherCount ?? "-" },
      { label: "学生数", value: data.stats?.studentCount ?? "-" },
      { label: "管理员数", value: data.stats?.adminCount ?? "-" },
      { label: "课程数", value: data.stats?.courseCount ?? "-" },
      { label: "已发布课程数", value: data.stats?.publishedCourseCount ?? "-" },
      { label: "本学期课程数", value: data.stats?.currentSemesterCourseCount ?? "-" },
      { label: "选课人数", value: data.stats?.enrollmentCount ?? "-" },
      { label: "实验集数量", value: data.stats?.labSetCount ?? "-" },
      { label: "作业数量", value: data.stats?.homeworkCount ?? "-" },
      { label: "当前选课阶段", value: data.stats?.enrollmentPhase ?? "-" },
    ],
    [data],
  );

  return (
    <AdminLayout
      title="管理控制台"
      subtitle={`超级管理员 · ${data.semester?.label ?? "-"}`}
    >
      {error ? <div className="page-alert page-alert--warn">{error}</div> : null}

      <div className={styles.stats}>
        {stats.map((item) => (
          <article key={item.label} className={styles.stat}>
            <div className={styles.statLabel}>{item.label}</div>
            <div className={styles.statValue}>{item.value}</div>
          </article>
        ))}
      </div>

      <section className={styles.banner}>
        <div className={styles.bannerLabel}>选课时段</div>
        <div className={styles.bannerMeta}>
          开放时间：{fmtDate(data.schedule?.openAt)} · 截止时间：{fmtDate(data.schedule?.closeAt)} ·
          确认截止时间：{fmtDate(data.schedule?.confirmDeadline)}
        </div>
      </section>

      <h2 className={styles.sectionTitle}>最近几个选课周期</h2>
      <div className={styles.cardGrid}>
        {(data.recentPeriods ?? []).map((period) => (
          <article key={period.semesterKey} className={styles.card}>
            <div className={styles.quickTitle}>{period.label}</div>
            <div className={styles.quickDesc}>学期键：{period.semesterKey}</div>
            <div className={styles.quickDesc}>阶段：{period.phase}</div>
            <div className={styles.quickDesc}>开放：{fmtDate(period.openAt)}</div>
            <div className={styles.quickDesc}>截止：{fmtDate(period.closeAt)}</div>
            <div className={styles.quickDesc}>确认截止：{fmtDate(period.confirmDeadline)}</div>
          </article>
        ))}
      </div>
    </AdminLayout>
  );
}
