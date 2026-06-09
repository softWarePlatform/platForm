import { useEffect, useState } from "react";
import { getApiError } from "../../../api/errors";
import { api } from "../../../api/client";
import { useConfirm } from "../../../components/ui/ConfirmDialog";
import { useToast } from "../../../components/ui/Toast";
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
  const { confirm } = useConfirm();
  const { success } = useToast();
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
    const ok = await confirm({
      title: "删除实验集",
      message: `确定删除实验集「${title}」？${extra}`,
      confirmLabel: "删除",
      danger: true,
    });
    if (!ok) return;
    setErr(null);
    try {
      await api.delete(`/courses/${cId}/lab-sets/${labSetId}`, {
        params: problemCount > 0 ? { force: 1 } : {},
      });
      await Promise.all([reload(), refreshSideData()]);
      success("已删除实验集");
    } catch (e2: unknown) {
      setErr(getApiError(e2, "删除失败"));
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
      <CourseSectionHead title="实验" actions={newLabSetButton} />

      {isTeacher ? (
        <LabSetListPanel
            mode="teacher"
            groups={teacherGroups}
            loading={loading}
            err={overviewErr}
            showCourseName={false}
            emptyHint="暂无实验集"
            onDelete={handleDelete}
          />
      ) : (
        <LabExplorerSets embedded courseIdProp={courseId} setsLinkPrefix={`/courses/${courseId}/labs/sets`} />
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
