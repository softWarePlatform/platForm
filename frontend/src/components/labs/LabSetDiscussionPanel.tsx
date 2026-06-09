import { useCallback, useEffect, useState } from "react";
import { api } from "../../api/client";

type PostItem = {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  resolved: boolean;
  viewCount: number;
  commentCount: number;
  createdAt: string;
  author: { id: string | null; name: string; isTeacher: boolean; isAnonymous?: boolean };
};

type Props = {
  courseId: string;
  labSetId: string;
};

export default function LabSetDiscussionPanel({ courseId, labSetId }: Props) {
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [hot, setHot] = useState<PostItem[]>([]);
  const [q, setQ] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    const { data } = await api.get<{ posts: PostItem[]; hot: PostItem[] }>(
      `/courses/${courseId}/lab-sets/${labSetId}/discussions`,
      { params: { q: q.trim() || undefined, sort: "hot" } },
    );
    setPosts(data.posts ?? []);
    setHot(data.hot ?? []);
  }, [courseId, labSetId, q]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="grid" style={{ gap: 12 }}>
      <div className="row spread" style={{ flexWrap: "wrap", gap: 8 }}>
        <input
          placeholder="搜索标题/内容/作者"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ flex: 1, minWidth: 160 }}
        />
        <button type="button" className="btn" onClick={() => void load()}>
          搜索
        </button>
        <button type="button" className="btn primary" onClick={() => setModalOpen(true)}>
          发帖提问
        </button>
      </div>

      {hot.length > 0 ? (
        <div className="card" style={{ padding: 12, background: "#fffbeb" }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>热门问题</div>
          {hot.map((p) => (
            <div key={p.id} style={{ marginBottom: 6 }}>
              <strong>{p.title}</strong>
              <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>
                {p.commentCount} 回复 · {p.viewCount} 浏览
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid" style={{ gap: 10 }}>
        {posts.map((p) => (
          <div
            key={p.id}
            className="card"
            style={{ padding: 12, borderColor: p.resolved ? "#86efac" : undefined }}
          >
            <div className="row spread" style={{ flexWrap: "wrap", gap: 6 }}>
              <strong>{p.title}</strong>
              {p.pinned ? <span className="practice-badge">置顶</span> : null}
              {p.resolved ? <span className="practice-badge practice-badge--ok">已解决</span> : null}
            </div>
            <p className="muted" style={{ fontSize: 13, margin: "8px 0" }}>
              {p.author.name}
              {p.author.isTeacher ? " · 老师" : ""} · {new Date(p.createdAt).toLocaleString()}
            </p>
            <p style={{ fontSize: 14, margin: 0, whiteSpace: "pre-wrap" }}>{p.body}</p>
          </div>
        ))}
        {posts.length === 0 ? <div className="muted">暂无帖子，欢迎提问</div> : null}
      </div>

      {modalOpen ? (
        <LabSetPostModal
          courseId={courseId}
          labSetId={labSetId}
          onClose={() => setModalOpen(false)}
          onCreated={() => {
            setModalOpen(false);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}

function LabSetPostModal({
  courseId,
  labSetId,
  onClose,
  onCreated,
}: {
  courseId: string;
  labSetId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="card modal-panel" role="dialog" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>实验集讨论 · 发帖</h3>
        <div className="field">
          <label>标题</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label>内容（支持 Markdown）</label>
          <textarea rows={6} value={body} onChange={(e) => setBody(e.target.value)} />
        </div>
        <label className="row" style={{ gap: 8 }}>
          <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
          匿名发帖
        </label>
        {err ? <div className="err">{err}</div> : null}
        <div className="row" style={{ gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
          <button type="button" className="btn" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={saving || !title.trim() || !body.trim()}
            onClick={async () => {
              setSaving(true);
              setErr(null);
              try {
                await api.post(`/courses/${courseId}/lab-sets/${labSetId}/discussions`, {
                  title: title.trim(),
                  body: body.trim(),
                  anonymous,
                });
                onCreated();
              } catch (e: unknown) {
                const msg =
                  typeof e === "object" && e !== null && "response" in e
                    ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
                    : null;
                setErr(msg ?? "发帖失败");
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "发布中…" : "发布"}
          </button>
        </div>
      </div>
    </div>
  );
}
