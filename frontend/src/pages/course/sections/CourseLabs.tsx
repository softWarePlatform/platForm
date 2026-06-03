import { useEffect, useState } from "react";
import { api } from "../../../api/client";
import CreateLabSetModal from "../../../components/labs/CreateLabSetModal";
import LabSetListPanel from "../../../features/labs/LabSetListPanel";
import LabExplorerSets from "../../../features/labs/explorer/LabExplorerSets";
import { useLabSetOverview } from "../../../features/labs/useLabSetOverview";
import { useCourse } from "../CourseContext";
import CourseSectionHead from "../CourseSectionHead";
import type {
  LabSetOverviewGroup,
  TeacherLabSetOverviewCard,
} from "../../../features/labs/labSetTypes";

export default function CourseLabs() {
  const { courseId, isTeacher, setErr, refreshSideData } = useCourse();
  const [createOpen, setCreateOpen] = useState(false);
  const mode = isTeacher ? "teacher" : "student";
  const { data, err: overviewErr, loading, reload } = useLabSetOverview(mode, courseId);

  useEffect(() => {
    setErr(overviewErr);
  }, [overviewErr, setErr]);

  const teacherGroups =
    (data?.groups as LabSetOverviewGroup<TeacherLabSetOverviewCard>[] | undefined) ?? [];

  async function handleDelete(
    cId: string,
    labSetId: string,
    title: string,
    problemCount: number,
  ) {
    const extra =
      problemCount > 0
        ? `将删除本集下 ${problemCount} 道题及全部测试用例与学生提交，且不可恢复。`
        : "将删除本实验集（当前无题目），不可恢复。";
    if (!confirm(`确定删除实验集「${title}」？${extra}`)) return;
    setErr(null);
    try {
      await api.delete(`/courses/${cId}/lab-sets/${labSetId}`, {
        params: problemCount > 0 ? { force: 1 } : {},
      });
      await Promise.all([reload(), refreshSideData()]);
    } catch (e2: unknown) {
      const msg =
        typeof e2 === "object" && e2 !== null && "response" in e2
          ? (e2 as { response?: { data?: { error?: string } } }).response?.data?.error
          : null;
      setErr(msg ?? "删除失败");
    }
  }

  async function handleLabSetCreated() {
    await Promise.all([reload(), refreshSideData()]);
  }

  const newLabSetButton = isTeacher ? (
    <button type="button" className="btn primary" onClick={() => setCreateOpen(true)}>
      新建实验集
    </button>
  ) : null;

  return (
    <div>
      <CourseSectionHead
        title="实验管理"
        description={
          isTeacher
            ? "按状态查看本课实验集与学生完成情况；可新建实验集、管理题目与评测配置。"
            : "每次作业一行展示进度；点进作业查看各题 AC / WA。"
        }
      />

      {isTeacher ? (
        <LabSetListPanel
          mode="teacher"
          groups={teacherGroups}
          loading={loading}
          err={overviewErr}
          showCourseName={false}
          emptyHint="暂无实验集，点击「新建实验集」开始布置。"
          headerRight={newLabSetButton}
          onDelete={handleDelete}
        />
      ) : (
        <LabExplorerSets embedded courseIdProp={courseId} setsLinkPrefix={`/courses/${courseId}/lab-sets`} />
      )}

      {isTeacher && courseId ? (
        <CreateLabSetModal
          open={createOpen}
          fixedCourseId={courseId}
          onClose={() => setCreateOpen(false)}
          onCreated={handleLabSetCreated}
        />
      ) : null}
    </div>
  );
}
