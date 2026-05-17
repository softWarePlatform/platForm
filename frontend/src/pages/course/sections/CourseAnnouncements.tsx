import { api } from "../../../api/client";
import { useCourse } from "../CourseContext";
import CourseSectionHead from "../CourseSectionHead";

export default function CourseAnnouncements() {
  const { courseId, canUseQA, newPost, setNewPost, posts, setErr, refreshSideData } = useCourse();

  return (
    <div>
      <CourseSectionHead
        title="课程公告"
        description="查看教师发布的通知；教师与已选课学生可发布新公告。"
      />

      {canUseQA ? (
        <form
          className="grid"
          style={{ marginBottom: 24, maxWidth: 560 }}
          onSubmit={async (e) => {
            e.preventDefault();
            setErr(null);
            try {
              await api.post(`/courses/${courseId}/discussions`, newPost);
              setNewPost({ title: "", body: "" });
              await refreshSideData();
            } catch (e2: unknown) {
              const msg =
                typeof e2 === "object" && e2 !== null && "response" in e2
                  ? (e2 as { response?: { data?: { error?: string } } }).response?.data?.error
                  : null;
              setErr(msg ?? "发布失败（请先选课）");
            }
          }}
        >
          <div className="field">
            <label>公告标题</label>
            <input
              value={newPost.title}
              onChange={(e) => setNewPost({ ...newPost, title: e.target.value })}
              placeholder="例如：第 3 周实验安排"
              required
            />
          </div>
          <div className="field">
            <label>公告内容</label>
            <textarea
              rows={4}
              value={newPost.body}
              onChange={(e) => setNewPost({ ...newPost, body: e.target.value })}
              required
            />
          </div>
          <button className="btn primary" type="submit" style={{ width: "fit-content" }}>
            发布公告
          </button>
        </form>
      ) : (
        <p className="muted" style={{ marginBottom: 20 }}>
          登录并选课后可发布公告。
        </p>
      )}

      {posts.length === 0 ? (
        <div className="course-section-empty">暂无公告</div>
      ) : (
        <div>
          {posts.map((p: { id: string; title: string; body: string; user: { name: string }; createdAt: string }) => (
            <article key={p.id} className="course-list-item" style={{ flexDirection: "column", alignItems: "stretch" }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{p.title}</div>
              <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                {p.user.name} · {new Date(p.createdAt).toLocaleString()}
              </div>
              <p style={{ margin: "10px 0 0", lineHeight: 1.75, whiteSpace: "pre-wrap" }}>{p.body}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
