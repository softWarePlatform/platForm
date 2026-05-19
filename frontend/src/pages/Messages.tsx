import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { refreshAfterAnnouncementRead, refreshNotificationBadge } from "../lib/appEvents";

type NotificationRow = {
  id: string;
  title: string;
  body: string | null;
  linkPath: string | null;
  read: boolean;
  createdAt: string;
  announcementDeleted: boolean;
};

export default function Messages() {
  const navigate = useNavigate();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get<{ notifications: NotificationRow[] }>("/notifications");
      setItems(data.notifications);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function open(n: NotificationRow) {
    if (!n.read) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      refreshNotificationBadge();
      await api.patch(`/notifications/${n.id}/read`).catch(() => {});
    }
    if (n.announcementDeleted) {
      alert("公告已删除");
      await load();
      refreshNotificationBadge();
      return;
    }
    if (n.linkPath) {
      if (n.linkPath.includes("/announcements/")) {
        refreshAfterAnnouncementRead();
      }
      navigate(n.linkPath);
    }
  }

  async function markAllRead() {
    setItems((prev) => prev.map((x) => ({ ...x, read: true })));
    refreshNotificationBadge();
    await api.post("/notifications/read-all");
    await load();
    refreshNotificationBadge();
  }

  return (
    <div className="container" style={{ paddingTop: 20, paddingBottom: 32 }}>
      <div className="spread" style={{ marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: "0 0 6px" }}>站内消息</h1>
          <p className="muted" style={{ margin: 0 }}>课程公告、资料更新等系统通知将显示在这里。</p>
        </div>
        {items.some((n) => !n.read) ? (
          <button type="button" className="btn" onClick={markAllRead}>
            全部标为已读
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="muted">加载中…</div>
      ) : items.length === 0 ? (
        <div className="card course-section-empty">暂无消息</div>
      ) : (
        <ul className="notification-list card" style={{ padding: 0, overflow: "hidden" }}>
          {items.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                className={`notification-list__item${n.read ? "" : " notification-list__item--unread"}`}
                onClick={() => open(n)}
              >
                <div className="notification-list__title">{n.title}</div>
                <div className="muted notification-list__time">
                  {new Date(n.createdAt).toLocaleString()}
                  {n.announcementDeleted ? " · 公告已删除" : ""}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
