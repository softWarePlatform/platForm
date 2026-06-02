import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import CreateLabSetModal from "../../components/labs/CreateLabSetModal";
import LabSetListPanel from "../../features/labs/LabSetListPanel";
import { useLabSetOverview } from "../../features/labs/useLabSetOverview";
import type { LabSetOverviewGroup, TeacherLabSetOverviewCard } from "../../features/labs/labSetTypes";

export default function TeachingLabs() {
  const { user } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const { data, err, loading, reload } = useLabSetOverview("teacher");
  const groups =
    (data?.groups as LabSetOverviewGroup<TeacherLabSetOverviewCard>[] | undefined) ?? [];

  const listIntro =
    user?.role === "ADMIN"
      ? "以下为系统中全部授课课程的实验集（管理员视图）。"
      : "以下为您授课课程下的实验集，可按状态查看完成情况。在课程内可新建实验集与题目。";

  async function handleDelete(
    courseId: string,
    labSetId: string,
    title: string,
    problemCount: number,
  ) {
    const extra =
      problemCount > 0
        ? `将删除本集下 ${problemCount} 道题及全部测试用例与学生提交，且不可恢复。`
        : "将删除本实验集（当前无题目），不可恢复。";
    if (!confirm(`确定删除实验集「${title}」？${extra}`)) return;
    try {
      await api.delete(`/courses/${courseId}/lab-sets/${labSetId}`, {
        params: problemCount > 0 ? { force: 1 } : {},
      });
      await reload();
    } catch (e: unknown) {
      const msg =
        typeof e === "object" && e !== null && "response" in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : null;
      alert(msg ?? "删除失败");
    }
  }

  return (
    <div className="container">
      <div className="spread" style={{ marginTop: 10, alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>实验管理</h2>
          <p className="muted" style={{ marginTop: 8, lineHeight: 1.6, maxWidth: 720 }}>
            {listIntro}
          </p>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn primary" onClick={() => setCreateOpen(true)}>
            新建实验集
          </button>
          <button type="button" className="btn" onClick={() => void reload()}>
            刷新列表
          </button>
          <Link className="btn" to="/teaching">
            教学台
          </Link>
        </div>
      </div>

      {err ? <div className="err" style={{ marginTop: 12 }}>{err}</div> : null}

      <div className="dash-panel" style={{ marginTop: 16 }}>
        <LabSetListPanel
          mode="teacher"
          groups={groups}
          loading={loading}
          err={err}
          showCourseName
          emptyHint="暂无实验集，点击上方「新建实验集」选择课程后开始布置。"
          onDelete={handleDelete}
        />
      </div>

      <CreateLabSetModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={reload}
      />
    </div>
  );
}
