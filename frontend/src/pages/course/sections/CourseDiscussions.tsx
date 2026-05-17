import { api } from "../../../api/client";
import { useCourse } from "../CourseContext";

export default function CourseDiscussions() {
  const { courseId, canUseQA, newPost, setNewPost, posts, setErr, refreshSideData } = useCourse();

  return (
    <div>
      <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>课程问答</h2>
      {!canUseQA ? <div className="muted">登录后可参与讨论。</div> : null}
      {canUseQA ? (
        <form
          className="grid"
          style={{ marginTop: 12 }}
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
              setErr(msg ?? "发帖失败（可能需要先选课）");
            }
          }}
        >
          <div className="field">
            <label>标题</label>
            <input
              value={newPost.title}
              onChange={(e) => setNewPost({ ...newPost, title: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label>内容</label>
            <textarea
              rows={4}
              value={newPost.body}
              onChange={(e) => setNewPost({ ...newPost, body: e.target.value })}
              required
            />
          </div>
          <button className="btn primary" type="submit">
            发布
          </button>
        </form>
      ) : null}

      <div className="grid" style={{ marginTop: 16 }}>
        {posts.map((p: { id: string; title: string; body: string; user: { name: string }; createdAt: string }) => (
          <div key={p.id} style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
            <div style={{ fontWeight: 800 }}>{p.title}</div>
            <div className="muted">
              {p.user.name} · {new Date(p.createdAt).toLocaleString()}
            </div>
            <div style={{ marginTop: 8, lineHeight: 1.7 }}>{p.body}</div>
          </div>
        ))}
        {posts.length === 0 ? <div className="muted">暂无帖子</div> : null}
      </div>
    </div>
  );
}
