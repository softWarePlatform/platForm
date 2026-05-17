import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { api } from "../../../api/client";
import { useCourse } from "../CourseContext";

type AnnouncementDetail = {
  id: string;
  courseId: string;
  title: string;
  content: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  edited: boolean;
  author: { id: string; name: string };
};

export default function CourseAnnouncementDetail() {
  const { announcementId } = useParams();
  const navigate = useNavigate();
  const { courseId, setErr } = useCourse();
  const [item, setItem] = useState<AnnouncementDetail | null>(null);
  const [deleted, setDeleted] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!courseId || !announcementId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get(`/courses/${courseId}/announcements/${announcementId}`);
        if (!cancelled) {
          setItem(data.announcement);
          setDeleted(false);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          const res =
            typeof e === "object" && e !== null && "response" in e
              ? (e as { response?: { data?: { deleted?: boolean; error?: string } } }).response?.data
              : undefined;
          if (res?.deleted) setDeleted(true);
          else setErr(res?.error ?? "加载失败");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId, announcementId, setErr]);

  if (loading) return <div className="muted">加载中…</div>;

  if (deleted) {
    return (
      <div>
        <div className="course-section-empty">公告已删除</div>
        <Link className="btn" to={`/courses/${courseId}/announcements`} style={{ marginTop: 16 }}>
          返回公告列表
        </Link>
      </div>
    );
  }

  if (!item) return null;

  return (
    <div>
      <button
        type="button"
        className="btn"
        style={{ marginBottom: 16 }}
        onClick={() => navigate(`/courses/${courseId}/announcements`)}
      >
        ← 返回列表
      </button>

      <article className="announcement-detail">
        <div className="announcement-detail__head">
          {item.pinned ? <span className="ann-badge ann-badge--pin">置顶</span> : null}
          <h2 className="announcement-detail__title">{item.title}</h2>
          <div className="muted announcement-detail__meta">
            {item.author.name} · 发布于 {new Date(item.createdAt).toLocaleString()}
            {item.edited ? ` · 已编辑于 ${new Date(item.updatedAt).toLocaleString()}` : null}
          </div>
        </div>
        <div className="announcement-detail__body markdown-body">
          <ReactMarkdown>{item.content}</ReactMarkdown>
        </div>
      </article>
    </div>
  );
}
