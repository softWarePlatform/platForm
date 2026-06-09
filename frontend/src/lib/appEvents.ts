/** 站内消息未读数变化（标已读、读公告等） */
export const NOTIFICATIONS_REFRESH = "tp-notifications-refresh";

/** 主界面课表/课程卡片数据需刷新 */
export const DASHBOARD_REFRESH = "tp-dashboard-refresh";

export function refreshNotificationBadge() {
  window.dispatchEvent(new CustomEvent(NOTIFICATIONS_REFRESH));
}

export function refreshDashboard() {
  window.dispatchEvent(new CustomEvent(DASHBOARD_REFRESH));
}

export function refreshAfterAnnouncementRead() {
  refreshNotificationBadge();
  refreshDashboard();
}
