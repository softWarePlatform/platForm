import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import DiscussionPostModal from "./DiscussionPostModal";

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
  labId: string;
};

export default function LabDiscussionPanel({ courseId, labId }: Props) {
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [hot, setHot] = useState<PostItem[]>([]);
  const [q, setQ] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    const { data } = await api.get<{ posts: PostItem[]; hot: PostItem[] }>(
      `/labs/${labId}/discussions`,
      { params: { q: q.trim() || undefined, sort: "hot" } },
    );
    setPosts(data.posts ?? []);
    setHot(data.hot ?? []);
  }, [labId, q]);

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
          我要提问
        </button>
      </div>

      {hot.length > 0 ? (
        <div className="card" style={{ padding: 12, background: "#fffbeb" }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>热门问题</div>
          {hot.map((p) => (
            <div key={p.id} style={{ marginBottom: 6 }}>
              <Link to={`/courses/${courseId}/labs/${labId}/discussions/${p.id}`}>{p.title}</Link>
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
            style={{
              padding: 12,
              borderColor: p.resolved ? "#86efac" : undefined,
              background: p.resolved ? "#f0fdf4" : undefined,
            }}
          >
            <div className="row spread" style={{ flexWrap: "wrap", gap: 6 }}>
              <Link
                to={`/courses/${courseId}/labs/${labId}/discussions/${p.id}`}
                style={{ fontWeight: 800, fontSize: 15 }}
              >
                {p.title}
              </Link>
              <div className="row" style={{ gap: 6 }}>
                {p.pinned ? <span className="disc-badge disc-badge--pin">置顶</span> : null}
                {p.resolved ? <span className="disc-badge disc-badge--ok">已解决</span> : null}
                {p.author.isTeacher ? (
                  <span className="disc-badge disc-badge--teacher">老师</span>
                ) : null}
              </div>
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              {p.author.name} · {new Date(p.createdAt).toLocaleString()} · {p.commentCount} 回复
            </div>
            <p style={{ margin: "8px 0 0", fontSize: 14, lineHeight: 1.55 }}>{p.body}</p>
          </div>
        ))}
        {posts.length === 0 ? <div className="muted">暂无帖子</div> : null}
      </div>

      <DiscussionPostModal
        open={modalOpen}
        courseId={courseId}
        labId={labId}
        onClose={() => setModalOpen(false)}
        onCreated={() => void load()}
      />
    </div>
  );
}
