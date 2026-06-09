import { useMemo, useState } from "react";
import { getApiError } from "../../api/errors";
import { api } from "../../api/client";
import CreateLabSetModal from "../../components/labs/CreateLabSetModal";
import PageShell from "../../components/layout/PageShell";
import TeachingSubnav from "../../components/layout/TeachingSubnav";
import Reveal from "../../components/motion/Reveal";
import { useConfirm } from "../../components/ui/ConfirmDialog";
import { useToast } from "../../components/ui/Toast";
import LabSetListPanel from "../../features/labs/LabSetListPanel";
import { useLabSetOverview } from "../../features/labs/useLabSetOverview";
import type { LabSetOverviewGroup, TeacherLabSetOverviewCard } from "../../features/labs/labSetTypes";
import TeachingStatsBar from "../../features/teaching/TeachingStatsBar";
import TeachingWelcome from "../../features/teaching/TeachingWelcome";
import { useAuth } from "../../auth/AuthContext";

export default function TeachingLabs() {
  const { user } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const { confirm } = useConfirm();
  const { success, error: toastError } = useToast();
  const { data, err, loading, reload } = useLabSetOverview("teacher");
  const groups =
    (data?.groups as LabSetOverviewGroup<TeacherLabSetOverviewCard>[] | undefined) ?? [];
  const total = groups.reduce((n, g) => n + g.items.length, 0);

  const stats = useMemo(() => {
    const items = groups.flatMap((g) => g.items);
    const problems = items.reduce((n, i) => n + i.problemCount, 0);
    const active = groups.find((g) => g.status === "IN_PROGRESS")?.items.length ?? 0;
    const closed = groups.find((g) => g.status === "CLOSED")?.items.length ?? 0;
    return [
      { key: "total", label: "实验集", value: String(total), tone: "teal" as const, icon: "🧪" },
      { key: "active", label: "进行中", value: String(active), tone: "blue" as const, icon: "⚡" },
      { key: "done", label: "已截止", value: String(closed), tone: "purple" as const, icon: "🏁" },
      { key: "prob", label: "题目总数", value: String(problems), tone: "amber" as const, icon: "📝" },
    ];
  }, [groups, total]);

  async function handleDelete(
    courseId: string,
    labSetId: string,
    title: string,
    problemCount: number,
  ) {
    const extra =
      problemCount > 0
        ? `将删除 ${problemCount} 道题及全部提交，不可恢复。`
        : "将删除该实验集，不可恢复。";
    const ok = await confirm({
      title: "删除实验集",
      message: `确定删除「${title}」？${extra}`,
      confirmLabel: "删除",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/courses/${courseId}/lab-sets/${labSetId}`, {
        params: problemCount > 0 ? { force: 1 } : {},
      });
      await reload();
      success("已删除实验集");
    } catch (e: unknown) {
      toastError(getApiError(e, "删除失败"));
    }
  }

  if (!user) return <div className="container muted">加载中…</div>;

  return (
    <PageShell className="teach-page">
      <div className="teach-home">
        <Reveal>
          <TeachingWelcome name={user.name} section="实验管理" lead={`共 ${total} 个实验集`} />
        </Reveal>

        <Reveal delay={0.04}>
          <div className="teach-toolbar">
            <TeachingSubnav />
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <button type="button" className="btn primary" onClick={() => setCreateOpen(true)}>
                新建实验集
              </button>
              <button type="button" className="btn" onClick={() => void reload()}>
                刷新
              </button>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.06}>
          <TeachingStatsBar items={stats} />
        </Reveal>

        <Reveal delay={0.08}>
          <section className="dash-glass-panel teach-labs-panel">
            <div className="dash-section-head dash-section-head--compact">
              <h2 className="dash-section-head__title">实验集列表</h2>
            </div>
            <LabSetListPanel
              mode="teacher"
              variant="vivid"
              groups={groups}
              loading={loading}
              err={err}
              showCourseName
              emptyHint="暂无实验集"
              onDelete={handleDelete}
            />
          </section>
        </Reveal>
      </div>

      <CreateLabSetModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={reload} />
    </PageShell>
  );
}
