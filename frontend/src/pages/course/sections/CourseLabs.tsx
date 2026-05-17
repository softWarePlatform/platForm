import { Link } from "react-router-dom";
import { api } from "../../../api/client";
import { useCourse } from "../CourseContext";
import CourseSectionHead from "../CourseSectionHead";

export default function CourseLabs() {
  const {
    courseId,
    isTeacher,
    labSets,
    displayLabs,
    setErr,
    refreshSideData,
  } = useCourse();

  return (
    <div>
      <CourseSectionHead
        title="实验管理"
        description={
          isTeacher
            ? "创建实验集、配置题目与评测用例；学生在线提交代码并自动评测。"
            : "进入实验集查看题目与截止时间，在 IDE 中编写并提交代码。"
        }
      />
      {isTeacher ? (
        <div className="row" style={{ marginTop: 12, flexWrap: "wrap", gap: 8 }}>
          <button
            type="button"
            className="btn primary"
            onClick={async () => {
              setErr(null);
              try {
                await api.post(`/courses/${courseId}/lab-sets`, {
                  title: `新实验 ${new Date().toLocaleString()}`,
                });
                await refreshSideData();
              } catch (e2: unknown) {
                const msg =
                  typeof e2 === "object" && e2 !== null && "response" in e2
                    ? (e2 as { response?: { data?: { error?: string } } }).response?.data?.error
                    : null;
                setErr(msg ?? "创建实验失败");
              }
            }}
          >
            新建实验集
          </button>
        </div>
      ) : null}
      <div>
        {labSets.length > 0
          ? labSets.map((s: { id: string; title: string; problemCount?: number; dueAt?: string }) => (
              <div
                key={s.id}
                className="course-list-item"
              >
                <div>
                  <div style={{ fontWeight: 700 }}>{s.title}</div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {s.problemCount ?? 0} 道题目
                    {s.dueAt
                      ? ` · 截止 ${new Date(s.dueAt).toLocaleString()}`
                      : " · 未设置截止时间"}
                  </div>
                </div>
                <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                  <Link className="btn primary" to={`/courses/${courseId}/lab-sets/${s.id}`}>
                    进入实验
                  </Link>
                  {isTeacher ? (
                    <>
                      <Link className="btn" to={`/courses/${courseId}/lab-sets/${s.id}/manage`}>
                        管理
                      </Link>
                      <button
                        type="button"
                        className="btn"
                        style={{ color: "#f85149" }}
                        onClick={async () => {
                          const n = Number(s.problemCount ?? 0);
                          const extra =
                            n > 0
                              ? `将删除本集下 ${n} 道题及全部测试用例与学生提交，且不可恢复。`
                              : "将删除本实验集（当前无题目），不可恢复。";
                          if (!confirm(`确定删除实验集「${s.title}」？${extra}`)) return;
                          setErr(null);
                          try {
                            await api.delete(`/courses/${courseId}/lab-sets/${s.id}`, {
                              params: n > 0 ? { force: 1 } : {},
                            });
                            await refreshSideData();
                          } catch (e2: unknown) {
                            const msg =
                              typeof e2 === "object" && e2 !== null && "response" in e2
                                ? (e2 as { response?: { data?: { error?: string } } }).response?.data
                                    ?.error
                                : null;
                            setErr(msg ?? "删除失败");
                          }
                        }}
                      >
                        删除
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            ))
          : displayLabs.map((l: { id: string; title: string; language: string }) => (
              <div key={l.id} className="course-list-item">
                <div>
                  <div style={{ fontWeight: 700 }}>{l.title}</div>
                  <div className="muted">{l.language}</div>
                </div>
                <Link className="btn primary" to={`/courses/${courseId}/labs/${l.id}`}>
                  进入实验
                </Link>
              </div>
            ))}
        {labSets.length === 0 && displayLabs.length === 0 ? (
          <div className="course-section-empty">暂无实验</div>
        ) : null}
      </div>
    </div>
  );
}
