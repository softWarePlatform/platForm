import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, type Role } from "../auth/AuthContext";
import { api } from "../api/client";
import EmptyState from "../components/layout/EmptyState";
import PageHeader from "../components/layout/PageHeader";
import PageShell from "../components/layout/PageShell";
import StatusBadge from "../components/layout/StatusBadge";
import { useToast } from "../components/ui/Toast";
import { refreshAfterAnnouncementRead, refreshNotificationBadge } from "../lib/appEvents";
import { coursePathForRole, legacyCoursePathToRolePath } from "../lib/coursePaths";

type NotificationRow = {
  id: string;
  type?: string;
  title: string;
  body: string | null;
  linkPath: string | null;
  read: boolean;
  createdAt: string;
  announcementDeleted: boolean;
  announcementId?: string | null;
  homeworkId?: string | null;
  materialId?: string | null;
  labSetId?: string | null;
  courseId?: string | null;
};

function notificationTypeLabel(type?: string): string | null {
  if (type === "HOMEWORK" || type?.startsWith("HOMEWORK_")) return "作业";
  if (type === "LAB_REMINDER" || type?.startsWith("LAB_")) return "实验";
  if (type === "DISCUSSION") return "讨论";
  if (type === "ANNOUNCEMENT") return "公告";
  if (type === "MATERIAL") return "资料";
  if (type === "PRACTICE") return "练习";
  if (type === "ENROLLMENT") return "选课";
  if (type === "ADMIN_ACTION") return "管理";
  return null;
}

function extractCourseId(path?: string | null): string | null {
  if (!path) return null;
  const match = path.match(/^\/(?:student|teacher|admin)\/courses\/([^/]+)/);
  if (match?.[1]) return match[1];
  const legacy = path.match(/^\/courses\/([^/]+)/);
  return legacy?.[1] ?? null;
}

function normalizeCourseLink(path: string, role?: Role | null) {
  if (path.startsWith("/courses")) return legacyCoursePathToRolePath(path, role);
  return path;
}

function targetForNotification(n: NotificationRow, role?: Role | null) {
  const courseId = n.courseId ?? extractCourseId(n.linkPath);
  if ((n.type === "HOMEWORK" || n.type?.startsWith("HOMEWORK_")) && courseId) {
    return coursePathForRole(courseId, n.homeworkId ? `homework/${n.homeworkId}` : "homework", role);
  }
  if (n.type === "ANNOUNCEMENT" && courseId) {
    return coursePathForRole(courseId, n.announcementId ? `announcements/${n.announcementId}` : "announcements", role);
  }
  if (n.type === "MATERIAL" && courseId) return coursePathForRole(courseId, "materials", role);
  if (n.type === "PRACTICE" && courseId) return coursePathForRole(courseId, "practice", role);
  if (n.type === "LAB_REMINDER" && courseId && n.labSetId) {
    return coursePathForRole(courseId, `labs/sets/${n.labSetId}`, role);
  }
  if (n.linkPath) return normalizeCourseLink(n.linkPath, role);
  return null;
}

export default function Messages() {
  const navigate = useNavigate();
  const { user } = useAuth();
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
    const target = targetForNotification(n, user?.role);
    if (target) {
      if (target.includes("/announcements/")) refreshAfterAnnouncementRead();
      navigate(target);
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
  const grouped = useMemo(() => items, [items]);

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
        <div className="panel-loading muted">加载中...</div>
      ) : grouped.length === 0 ? (
        <EmptyState title="暂无消息" />
      ) : (
        <ul className="notification-list panel">
          {grouped.map((n) => {
            const typeLabel = notificationTypeLabel(n.type);
            const target = targetForNotification(n, user?.role);
            return (
              <li key={n.id}>
                <button
                  type="button"
                  className={`notification-list__item${n.read ? "" : " notification-list__item--unread"}`}
                  onClick={() => void open(n)}
                  disabled={!target && !n.announcementDeleted}
                >
                  <div className="notification-list__row">
                    <span className="notification-list__title">{n.title}</span>
                    {typeLabel ? <StatusBadge tone="brand">{typeLabel}</StatusBadge> : null}
                  </div>
                  {n.body ? <div className="notification-list__body">{n.body}</div> : null}
                  <div className="notification-list__time">
                    {new Date(n.createdAt).toLocaleString()}
                    {n.announcementDeleted ? " · 已删除" : ""}
                    {!target && !n.announcementDeleted ? " · 无跳转目标" : ""}
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
