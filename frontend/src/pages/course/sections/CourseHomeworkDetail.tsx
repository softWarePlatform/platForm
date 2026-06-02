import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../../api/client";
import HomeworkEditForm from "../../../components/homework/HomeworkEditForm";
import HomeworkStudentSubmit from "../../../components/homework/HomeworkStudentSubmit";
import HomeworkStudentPanel from "../../../components/homework/HomeworkStudentPanel";
import HomeworkTeacherGradingPanel from "../../../components/homework/HomeworkTeacherGradingPanel";
import { useCourse } from "../CourseContext";

type ClassRow = { id: string; name: string };

function apiErrorMessage(e: unknown, fallback: string) {
  if (typeof e === "object" && e !== null && "response" in e) {
    return (e as { response?: { data?: { error?: string } } }).response?.data?.error ?? fallback;
  }
  return fallback;
}

export default function CourseHomeworkDetail() {
  const navigate = useNavigate();
  const { homeworkId = "" } = useParams();
  const {
    courseId,
    isTeacher,
    user,
    err,
    displayHomework,
    setErr,
    refreshSideData,
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

  const homework = displayHomework.find((h: any) => h.id === homeworkId);

  if (err) return <div className="err">{err}</div>;
  if (!homework) return <div className="muted">作业不存在或未加载。</div>;

  async function deleteHomework() {
    const ok = window.confirm(`确定删除作业「${homework!.title}」？此操作不可恢复。`);
    if (!ok) return;
    setDeleteBusy(true);
    setErr(null);
    try {
      await api.delete(`/homework/${homework!.id}`);
      await refreshSideData();
      navigate(`/courses/${courseId}/homework`, { replace: true });
    } catch (e: unknown) {
      setErr(apiErrorMessage(e, "删除失败"));
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="card" style={{ marginTop: 12, boxShadow: "none" }}>
      <div className="row spread" style={{ alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: 0 }}>{homework.title}</h3>
          <div className="muted" style={{ marginTop: 6 }}>
            截止：{homework.dueAt ? new Date(homework.dueAt).toLocaleString() : "未设置"}
          </div>
          <div className="muted" style={{ marginTop: 4 }}>
            {homework.targetClass ? `面向班级：${homework.targetClass.name}` : "面向全课程"}
            {isTeacher ? (homework.published ? " · 已发布" : " · 未发布") : null}
          </div>
        </div>
        <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
          <Link className="btn" to={`/courses/${courseId}/homework`}>
            返回列表
          </Link>
          {isTeacher ? (
            <>
              <Link className="btn" to={`/teaching/homework/${homework.id}`}>
                批改页
              </Link>
              <button className="btn" type="button" onClick={() => setEditing((v) => !v)}>
                {editing ? "收起编辑" : "编辑要求"}
              </button>
              <button
                className="btn"
                type="button"
                onClick={async () => {
                  await api.patch(`/homework/${homework.id}/publish`, { published: !homework.published });
                  await refreshSideData();
                }}
              >
                {homework.published ? "撤回发布" : "发布作业"}
              </button>
              <button
                className="btn primary"
                type="button"
                onClick={async () => {
                  await api.patch(`/homework/${homework.id}/release-grades`, {});
                  await refreshSideData();
                }}
              >
                发布已批改成绩
              </button>
              <button className="btn" type="button" disabled={deleteBusy} onClick={() => void deleteHomework()}>
                {deleteBusy ? "删除中…" : "删除作业"}
              </button>
            </>
          ) : null}
        </div>
      </div>

      {isTeacher && editing ? (
        <div style={{ marginTop: 12 }}>
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

      <div style={{ marginTop: 16 }}>
        <HomeworkStudentPanel homework={homework} />
      </div>

      {user?.role === "STUDENT" || user?.role === "ADMIN" ? (
        <HomeworkStudentSubmit homework={homework} onRefresh={refreshSideData} setErr={setErr} />
      ) : null}

      {isTeacher ? (
        <HomeworkTeacherGradingPanel homeworkId={homework.id} setErr={setErr} />
      ) : (
        <div className="muted" style={{ marginTop: 12 }}>学生可在此查看完整要求并提交作业。</div>
      )}
    </div>
  );
}
