import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../../api/client";
import { useCourse } from "../CourseContext";
import CourseSectionHead from "../CourseSectionHead";

export type AnnouncementRow = {
  id: string;
  title: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  edited: boolean;
  isNew: boolean;
  read: boolean;
  author: { id: string; name: string };
};

type ListResponse = {
  announcements: AnnouncementRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export default function CourseAnnouncements() {
  const { courseId, isTeacher, user, setErr } = useCourse();
  const [list, setList] = useState<AnnouncementRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AnnouncementRow | null>(null);
  const [form, setForm] = useState({ title: "", content: "", pinned: false, notifyAgain: false });

  const load = useCallback(async () => {
    if (!courseId) return;
    setLoading(true);
    try {
      const { data } = await api.get<ListResponse>(`/courses/${courseId}/announcements`, {
        params: { page, pageSize: 15 },
      });
      setList(data.announcements);
      setTotalPages(data.totalPages);
    } catch {
      setErr("无法加载公告列表");
    } finally {
      setLoading(false);
    }
  }, [courseId, page, setErr]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm({ title: "", content: "", pinned: false, notifyAgain: false });
    setShowForm(true);
  }

  function openEdit(row: AnnouncementRow) {
    setEditing(row);
    setForm({ title: row.title, content: "", pinned: row.pinned, notifyAgain: false });
    void api.get(`/courses/${courseId}/announcements/${row.id}`).then(({ data }) => {
      setForm((f) => ({
        ...f,
        content: data.announcement.content,
        pinned: data.announcement.pinned,
      }));
    });
    setShowForm(true);
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      if (editing) {
        await api.patch(`/announcements/${editing.id}`, {
          title: form.title,
          content: form.content,
          pinned: form.pinned,
          notifyAgain: form.notifyAgain,
        });
      } else {
        await api.post(`/courses/${courseId}/announcements`, {
          title: form.title,
          content: form.content,
          pinned: form.pinned,
        });
      }
      setShowForm(false);
      await load();
    } catch (e2: unknown) {
      const msg =
        typeof e2 === "object" && e2 !== null && "response" in e2
          ? (e2 as { response?: { data?: { error?: string } } }).response?.data?.error
          : null;
      setErr(msg ?? "保存失败");
    }
  }

  async function togglePin(row: AnnouncementRow) {
    if (!isTeacher || row.author.id !== user?.id && user?.role !== "ADMIN") return;
    await api.post(`/announcements/${row.id}/pin`, { pinned: !row.pinned });
    await load();
  }

  async function remove(row: AnnouncementRow) {
    if (!confirm("删除后不可恢复，确定删除吗？")) return;
    await api.delete(`/announcements/${row.id}`);
    await load();
  }

  const canManage = isTeacher;

  return (
    <div>
      <div className="spread" style={{ alignItems: "flex-start", marginBottom: 8 }}>
        <CourseSectionHead
          title="课程公告"
          description={
            isTeacher
              ? "发布、置顶与编辑公告；发布后选课学生会收到站内通知。"
              : "查看课程通知；未读公告在列表中加粗显示。"
          }
        />
        {canManage ? (
          <button type="button" className="btn primary" onClick={openCreate}>
            发布公告
          </button>
        ) : null}
      </div>

      {showForm ? (
        <form className="announcement-form card" onSubmit={submitForm}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>{editing ? "编辑公告" : "发布公告"}</div>
          <div className="field">
            <label>标题（1–100 字）</label>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              maxLength={100}
              required
            />
          </div>
          <div className="field">
            <label>内容（支持 Markdown：标题、列表、链接、代码块）</label>
            <textarea
              rows={8}
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              required
            />
          </div>
          <label className="row" style={{ marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={form.pinned}
              onChange={(e) => setForm({ ...form, pinned: e.target.checked })}
            />
            <span>置顶公告</span>
          </label>
          {editing ? (
            <label className="row" style={{ marginBottom: 12 }}>
              <input
                type="checkbox"
                checked={form.notifyAgain}
                onChange={(e) => setForm({ ...form, notifyAgain: e.target.checked })}
              />
              <span className="muted">重新通知选课学生</span>
            </label>
          ) : null}
          <div className="row">
            <button type="submit" className="btn primary">
              {editing ? "保存" : "发布"}
            </button>
            <button type="button" className="btn" onClick={() => setShowForm(false)}>
              取消
            </button>
          </div>
        </form>
      ) : null}

      {loading ? (
        <div className="muted" style={{ padding: 24 }}>加载中…</div>
      ) : list.length === 0 ? (
        <div className="course-section-empty">暂无公告</div>
      ) : (
        <ul className="announcement-list">
          {list.map((row) => {
            const isOwner = user?.id === row.author.id || user?.role === "ADMIN";
            return (
              <li
                key={row.id}
                className={`announcement-list__item${!row.read ? " announcement-list__item--unread" : ""}`}
              >
                <div className="announcement-list__main">
                  <div className="announcement-list__tags">
                    {row.pinned ? <span className="ann-badge ann-badge--pin">置顶</span> : null}
                    {row.isNew ? <span className="ann-badge ann-badge--new">NEW</span> : null}
                    {row.edited ? <span className="ann-badge ann-badge--edit">已编辑</span> : null}
                  </div>
                  <Link
                    to={`/courses/${courseId}/announcements/${row.id}`}
                    className="announcement-list__title"
                  >
                    {row.title}
                  </Link>
                  <div className="muted announcement-list__meta">
                    {row.author.name} · {new Date(row.createdAt).toLocaleString()}
                  </div>
                </div>
                {canManage && isOwner ? (
                  <div className="row announcement-list__actions">
                    <button type="button" className="btn" onClick={() => togglePin(row)}>
                      {row.pinned ? "取消置顶" : "置顶"}
                    </button>
                    <button type="button" className="btn" onClick={() => openEdit(row)}>
                      编辑
                    </button>
                    <button type="button" className="btn" onClick={() => remove(row)}>
                      删除
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {totalPages > 1 ? (
        <div className="row" style={{ marginTop: 16, justifyContent: "center" }}>
          <button
            type="button"
            className="btn"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            上一页
          </button>
          <span className="muted">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            className="btn"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            下一页
          </button>
        </div>
      ) : null}
    </div>
  );
}
