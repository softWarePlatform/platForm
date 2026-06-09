import {
  formatDateTime,
  labSetTimeBannerStyle,
  type LabSetTimeFields,
} from "./labSetAccess";

type Props = {
  labSet: LabSetTimeFields & { title?: string };
  showAccessMode?: boolean;
};

export default function LabSetTimeBanner({ labSet, showAccessMode = false }: Props) {
  const access = labSet.access;
  const style = labSetTimeBannerStyle(access);

  return (
    <div
      style={{
        marginTop: 12,
        padding: "10px 12px",
        borderRadius: 12,
        border: "1px solid var(--border)",
        fontSize: 13,
        lineHeight: 1.6,
        ...style,
      }}
    >
      {access ? (
        <div style={{ marginBottom: 8 }}>
          <strong>当前状态：{access.statusLabel}</strong>
          {!access.canSubmit ? (
            <span className="muted" style={{ marginLeft: 8 }}>
              · 不可提交评测
            </span>
          ) : null}
          {!access.canBrowse ? (
            <span style={{ marginLeft: 8 }}>· 不可访问</span>
          ) : null}
        </div>
      ) : null}
      <div>
        <strong>开始时间</strong>
        <span style={{ marginLeft: 8 }}>{formatDateTime(labSet.startAt)}</span>
      </div>
      <div style={{ marginTop: 4 }}>
        <strong>截止时间</strong>
        <span style={{ marginLeft: 8 }}>{formatDateTime(labSet.dueAt)}</span>
      </div>
      {labSet.allowMakeup ? (
        <div style={{ marginTop: 4 }}>
          <strong>补交截止</strong>
          <span style={{ marginLeft: 8 }}>{formatDateTime(labSet.makeupDueAt)}</span>
          {access?.inMakeupPeriod ? <span style={{ marginLeft: 8 }}>（补交进行中）</span> : null}
        </div>
      ) : (
        <div className="muted" style={{ marginTop: 4 }}>
          未开放补交
        </div>
      )}
      {showAccessMode ? (
        <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
          窗口外访问：
          {labSet.outsideAccessMode === "VIEW_ONLY"
            ? "可查看题面，不可提交"
            : "不可进入（阻断）"}
        </div>
      ) : null}
    </div>
  );
}
