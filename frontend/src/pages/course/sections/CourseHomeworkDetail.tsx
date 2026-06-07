import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getApiError } from "../../../api/errors";
import { api } from "../../../api/client";
import HomeworkEditForm from "../../../components/homework/HomeworkEditForm";
import HomeworkStudentSubmit from "../../../components/homework/HomeworkStudentSubmit";
import HomeworkStudentPanel from "../../../components/homework/HomeworkStudentPanel";
import HomeworkTeacherGradingPanel from "../../../components/homework/HomeworkTeacherGradingPanel";
import EmptyState from "../../../components/layout/EmptyState";
import { FormSkeleton } from "../../../components/layout/PageSkeleton";
import { useConfirm } from "../../../components/ui/ConfirmDialog";
import { useToast } from "../../../components/ui/Toast";
import { useCourse } from "../CourseContext";

type ClassRow = { id: string; name: string };

export default function CourseHomeworkDetail() {
  const navigate = useNavigate();
  const { homeworkId = "" } = useParams();
  const { confirm } = useConfirm();
  const { success: toastSuccess } = useToast();
  const {
    courseId,
    isTeacher,
    user,
    err,
    displayHomework,
    setErr,
    refreshSideData,
    course,
  } = useCourse();

  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [editing, setEditing] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    if (!isTeacher || !courseId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get(`/courses/${courseId}/classes`);
        if (!cancelled) setClasses(data.classes ?? []);
      } catch {
        if (!cancelled) setClasses([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId, isTeacher]);

  const homework = displayHomework.find((h: { id: string }) => h.id === homeworkId);

  if (!homework) {
    if (!course) return <FormSkeleton />;
    return <EmptyState title="作业不存在或未加载" />;
  }

  async function deleteHomework() {
    const ok = await confirm({
      title: "删除作业",
      message: `确定删除作业「${homework!.title}」？此操作不可恢复。`,
      confirmLabel: "删除",
      danger: true,
    });
    if (!ok) return;
    setDeleteBusy(true);
    setErr(null);
    try {
      await api.delete(`/homework/${homework!.id}`);
      await refreshSideData();
      toastSuccess("已删除作业");
      navigate(`/courses/${courseId}/homework`, { replace: true });
    } catch (e: unknown) {
      setErr(getApiError(e, "删除失败"));
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="homework-detail">
      {err ? <div className="page-alert err">{err}</div> : null}
      <div className="homework-detail__head row spread">
        <div>
          <h3 className="homework-detail__title">{homework.title}</h3>
          <div className="muted homework-detail__meta">
            截止：{homework.dueAt ? new Date(homework.dueAt).toLocaleString() : "未设置"}
          </div>
          <div className="muted homework-detail__meta">
            {homework.targetClass ? `面向班级：${homework.targetClass.name}` : "面向全课"}
            {isTeacher ? (homework.published ? " · 已发布" : " · 未发布") : null}
          </div>
        </div>
        <div className="row homework-detail__actions">
          <Link className="btn" to={`/courses/${courseId}/homework`}>
            返回列表
          </Link>
          {isTeacher ? (
            <>
              <button className="btn" type="button" onClick={() => setEditing((v) => !v)}>
                {editing ? "收起编辑" : "编辑要求"}
              </button>
              <button
                className="btn"
                type="button"
                onClick={async () => {
                  try {
                    await api.patch(`/homework/${homework.id}/publish`, { published: !homework.published });
                    await refreshSideData();
                    toastSuccess(homework.published ? "已撤回发布" : "已发布作业");
                  } catch (e: unknown) {
                    setErr(getApiError(e, "操作失败"));
                  }
                }}
              >
                {homework.published ? "撤回发布" : "发布作业"}
              </button>
              <button
                className="btn primary"
                type="button"
                onClick={async () => {
                  try {
                    await api.patch(`/homework/${homework.id}/release-grades`, {});
                    await refreshSideData();
                    toastSuccess("已发布批改成绩");
                  } catch (e: unknown) {
                    setErr(getApiError(e, "发布失败"));
                  }
                }}
              >
                发布已批改成绩
              </button>
              <button className="btn btn--danger" type="button" disabled={deleteBusy} onClick={() => void deleteHomework()}>
                {deleteBusy ? "删除中…" : "删除作业"}
              </button>
            </>
          ) : null}
        </div>
      </div>

      {isTeacher && editing ? (
        <div className="homework-detail__section">
          <HomeworkEditForm
            courseId={courseId}
            homework={homework}
            classes={classes}
            onCancel={() => setEditing(false)}
            onSaved={async () => {
              setEditing(false);
              await refreshSideData();
            }}
            setErr={setErr}
          />
        </div>
      ) : null}

      <div className="homework-detail__section">
        <HomeworkStudentPanel homework={homework} />
      </div>

      {user?.role === "STUDENT" || user?.role === "ADMIN" ? (
        <HomeworkStudentSubmit homework={homework} onRefresh={refreshSideData} setErr={setErr} />
      ) : null}

      {isTeacher ? (
        <HomeworkTeacherGradingPanel homeworkId={homework.id} setErr={setErr} />
      ) : null}
    </div>
  );
}
