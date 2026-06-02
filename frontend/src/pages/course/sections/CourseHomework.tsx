import { Link } from "react-router-dom";
import HomeworkPublishForm from "../../../components/homework/HomeworkPublishForm";
import { useCourse } from "../CourseContext";
import CourseSectionHead from "../CourseSectionHead";

export default function CourseHomework() {
  const {
    courseId,
    isTeacher,
    err,
    displayHomework,
    setErr,
    refreshSideData,
  } = useCourse();

  return (
    <div>
      <CourseSectionHead
        title="作业管理"
        description={isTeacher ? "发布作业、批改提交、发布成绩。" : "查看作业要求并提交作答。"}
      />
      {err ? <div className="err" style={{ marginTop: 12 }}>{err}</div> : null}
      <div>
          {isTeacher ? (
            <div style={{ marginTop: 12, paddingBottom: 16, borderBottom: "1px solid var(--border)" }}>
              <HomeworkPublishForm courseId={courseId} onCreated={refreshSideData} setErr={setErr} />
            </div>
          ) : null}
          <div style={{ marginTop: isTeacher ? 16 : 12, fontWeight: 800 }}>
            {isTeacher ? "已布置作业" : "作业列表"}
          </div>
          <div className="grid" style={{ marginTop: 10 }}>
            {displayHomework.map((h: any) => (
              <Link
                key={h.id}
                className="card"
                to={
                  isTeacher
                    ? `/teaching/homework/${h.id}`
                    : `/courses/${courseId}/homework/${h.id}`
                }
                style={{
                  display: "block",
                  padding: 14,
                  textDecoration: "none",
                  color: "inherit",
                  boxShadow: "none",
                  border: "1px solid var(--border)",
                }}
              >
                <div className="row spread" style={{ alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{h.title}</div>
                    <div className="muted" style={{ marginTop: 4 }}>
                      截止：{h.dueAt ? new Date(h.dueAt).toLocaleString() : "未设置"}
                    </div>
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    点击进入详情
                  </div>
                </div>
              </Link>
            ))}
            {displayHomework.length === 0 ? <div className="muted">暂无作业</div> : null}
          </div>
      </div>
    </div>
  );
}

