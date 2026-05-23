import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { ActiveLabReminder } from "./types";

type Props = {
  reminders: ActiveLabReminder[];
};

function formatEventAt(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function kindLabel(kind: ActiveLabReminder["kind"]): string {
  return kind === "BEFORE_START" ? "即将开始" : "即将截止";
}

export default function LabReminderBanner({ reminders }: Props) {
  const [dismissed, setDismissed] = useState(false);
  const [notifyAsked, setNotifyAsked] = useState(false);

  const visible = useMemo(
    () => (dismissed ? [] : reminders),
    [dismissed, reminders],
  );

  useEffect(() => {
    if (visible.length === 0 || typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;
    const first = visible[0];
    const tag = `lab-reminder-${first.labSetId}-${first.kind}`;
    try {
      new Notification(first.title, {
        body: first.body,
        tag,
      });
    } catch {
      /* ignore */
    }
  }, [visible]);

  if (visible.length === 0) return null;

  return (
    <div className="lab-reminder-banner" role="status">
      <div className="lab-reminder-banner__head">
        <strong>实验提醒</strong>
        <span className="muted" style={{ fontSize: 12 }}>
          开始前 / 截止前 2 小时内有效；关闭后再次进入主界面仍会显示
        </span>
        <div className="row" style={{ gap: 8, marginLeft: "auto" }}>
          {typeof Notification !== "undefined" &&
          Notification.permission === "default" &&
          !notifyAsked ? (
            <button
              type="button"
              className="btn"
              style={{ fontSize: 12, padding: "4px 10px" }}
              onClick={() => {
                setNotifyAsked(true);
                void Notification.requestPermission();
              }}
            >
              开启浏览器通知
            </button>
          ) : null}
          <button
            type="button"
            className="btn"
            style={{ fontSize: 12, padding: "4px 10px" }}
            onClick={() => setDismissed(true)}
          >
            本次关闭
          </button>
        </div>
      </div>
      <ul className="lab-reminder-banner__list">
        {visible.map((r) => (
          <li key={`${r.labSetId}-${r.kind}`} className="lab-reminder-banner__item">
            <span className={`lab-reminder-badge lab-reminder-badge--${r.kind.toLowerCase()}`}>
              {kindLabel(r.kind)}
            </span>
            <div className="lab-reminder-banner__text">
              <div style={{ fontWeight: 700 }}>{r.title}</div>
              <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
                {r.courseTitle} · {formatEventAt(r.eventAt)}
              </div>
              <p style={{ margin: "6px 0 0", fontSize: 13, lineHeight: 1.5 }}>{r.body}</p>
            </div>
            <Link className="btn primary" to={r.linkPath} style={{ flexShrink: 0 }}>
              前往实验集
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
