import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useToast } from "../components/ui/Toast";
import EmptyState from "../components/layout/EmptyState";
import PageHeader from "../components/layout/PageHeader";
import PageShell from "../components/layout/PageShell";
import StatusBadge from "../components/layout/StatusBadge";
import { refreshAfterAnnouncementRead, refreshNotificationBadge } from "../lib/appEvents";

type NotificationRow = {
  id: string;
  type?: string;
  title: string;
  body: string | null;
  linkPath: string | null;
  read: boolean;
  createdAt: string;
  announcementDeleted: boolean;
};

function notificationTypeLabel(type?: string): string | null {
  if (type === "LAB_REMINDER") return "实验";
  if (type === "DISCUSSION") return "讨论";
  if (type === "ANNOUNCEMENT") return "公告";
  return null;
}

export default function Messages() {
  const navigate = useNavigate();
  const { info } = useToast();
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
      info("公告已删除");
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

  const unread = items.filter((n) => !n.read).length;

  return (
    <PageShell narrow>
      <PageHeader
        title="站内消息"
        lead={unread > 0 ? `${unread} 条未读` : "全部已读"}
        actions={
          unread > 0 ? (
            <button type="button" className="btn" onClick={() => void markAllRead()}>
              全部已读
            </button>
          ) : null
        }
      />

      {loading ? (
        <div className="panel-loading muted">加载中…</div>
      ) : items.length === 0 ? (
        <EmptyState title="暂无消息" />
      ) : (
        <ul className="notification-list panel">
          {items.map((n) => {
            const typeLabel = notificationTypeLabel(n.type);
            return (
              <li key={n.id}>
                <button
                  type="button"
                  className={`notification-list__item${n.read ? "" : " notification-list__item--unread"}`}
                  onClick={() => void open(n)}
                >
                  <div className="notification-list__row">
                    <span className="notification-list__title">{n.title}</span>
                    {typeLabel ? <StatusBadge tone="brand">{typeLabel}</StatusBadge> : null}
                  </div>
                  <div className="notification-list__time">
                    {new Date(n.createdAt).toLocaleString()}
                    {n.announcementDeleted ? " · 已删除" : ""}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </PageShell>
  );
}
