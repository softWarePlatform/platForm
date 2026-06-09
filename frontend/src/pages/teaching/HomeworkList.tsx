import { useEffect, useMemo, useState } from "react";
import { api } from "../../api/client";
import PageShell from "../../components/layout/PageShell";
import TeachingSubnav from "../../components/layout/TeachingSubnav";
import Reveal from "../../components/motion/Reveal";
import TeachingHomeworkGrid, { type HomeworkRow } from "../../features/teaching/TeachingHomeworkGrid";
import TeachingStatsBar from "../../features/teaching/TeachingStatsBar";
import TeachingWelcome from "../../features/teaching/TeachingWelcome";
import { useAuth } from "../../auth/AuthContext";

export default function TeachingHomeworkList() {
  const { user } = useAuth();
  const [rows, setRows] = useState<HomeworkRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [legacyBackend, setLegacyBackend] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setErr(null);
      setLegacyBackend(false);
      try {
        const { data } = await api.get("/courses/mine");
        const d = data as {
          courses?: Array<{ _count?: { homeworks?: number } }>;
          teachingHomework?: { homework?: HomeworkRow[] };
          homework?: HomeworkRow[];
        };
        let hw = d.teachingHomework?.homework ?? d.homework ?? [];
        hw = Array.isArray(hw) ? hw : [];

        const homeworkCountFromCourses = (d.courses ?? []).reduce(
          (n, c) => n + (c._count?.homeworks ?? 0),
          0,
        );
        const tryTeachingEndpoint =
          hw.length === 0 &&
          (homeworkCountFromCourses > 0 || d.teachingHomework === undefined);
        if (tryTeachingEndpoint) {
          try {
            const { data: alt } = await api.get("/homework/teaching");
            const h2 = alt?.homework;
            if (Array.isArray(h2) && h2.length > 0) hw = h2;
          } catch {
            /* ignore */
          }
        }

        if (!cancelled) {
          setRows(hw);
          setLegacyBackend(
            d.teachingHomework === undefined && Array.isArray(d.courses) && d.courses.length > 0,
          );
        }
      } catch (e: unknown) {
        const ax = e as { response?: { status?: number; data?: { error?: string } }; message?: string };
        const status = ax.response?.status;
        const serverMsg = ax.response?.data?.error;
        let hint: string;
        if (status === 401) hint = "请重新登录";
        else if (status === 403) hint = "无教师权限";
        else if (status === 404 || /not\s*found/i.test(String(serverMsg ?? ""))) {
          hint = "接口不可用，请确认前后端已启动";
        } else if (serverMsg) hint = serverMsg;
        else hint = ax.message ?? "网络错误";
        if (!cancelled) setErr(hint);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const stats = useMemo(() => {
    const published = rows.filter((r) => r.published).length;
    const pending = rows.reduce((n, r) => n + Math.max(0, r.submissionCount - r.gradedCount), 0);
    const submissions = rows.reduce((n, r) => n + r.submissionCount, 0);
    return [
      { key: "total", label: "作业总数", value: String(rows.length), tone: "blue" as const, icon: "📋" },
      { key: "pending", label: "待批改", value: String(pending), tone: "amber" as const, icon: "✏️" },
      { key: "sub", label: "提交人次", value: String(submissions), tone: "purple" as const, icon: "📥" },
      { key: "pub", label: "已发布", value: String(published), tone: "teal" as const, icon: "✅" },
    ];
  }, [rows]);

  if (!user) return <div className="container muted">加载中…</div>;

  return (
    <PageShell className="teach-page">
      <div className="teach-home">
        <Reveal>
          <TeachingWelcome name={user.name} section="作业批改" lead={`共 ${rows.length} 项作业`} />
        </Reveal>

        <Reveal delay={0.04}>
          <div className="teach-toolbar">
            <TeachingSubnav />
            <button type="button" className="btn primary" onClick={() => setRefreshKey((k) => k + 1)}>
              刷新
            </button>
          </div>
        </Reveal>

        {err ? <div className="page-alert err">{err}</div> : null}
        {legacyBackend ? (
          <div className="page-alert page-alert--warn">后端版本较旧，请重启 npm run dev 后刷新</div>
        ) : null}

        <Reveal delay={0.06}>
          <TeachingStatsBar items={stats} />
        </Reveal>

        <Reveal delay={0.08}>
          <section className="dash-glass-panel teach-homework-panel">
            <div className="dash-section-head dash-section-head--compact">
              <h2 className="dash-section-head__title">全部作业</h2>
            </div>
            {!err ? <TeachingHomeworkGrid rows={rows} /> : null}
          </section>
        </Reveal>
      </div>
    </PageShell>
  );
}
