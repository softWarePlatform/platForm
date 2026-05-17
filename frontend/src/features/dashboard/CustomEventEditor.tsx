import type { Dispatch, SetStateAction } from "react";
import { PERIOD_OPTIONS } from "../../lib/schedulePeriods";
import { CUSTOM_EVENT_COLORS, type CustomEventDraft } from "./customEventForm";

const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

type Props = {
  mode: "add" | "edit";
  draft: CustomEventDraft;
  setDraft: Dispatch<SetStateAction<CustomEventDraft>>;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
  saveLabel?: string;
};

export default function CustomEventEditor({
  mode,
  draft,
  setDraft,
  onSave,
  onCancel,
  onDelete,
  saveLabel,
}: Props) {
  const inputStyle = {
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    width: "100%",
  };

  return (
    <div className="custom-event-editor card" style={{ boxShadow: "none" }}>
      <div className="spread" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 700 }}>{mode === "add" ? "添加个人事项" : "编辑个人事项"}</div>
        <button type="button" className="btn" onClick={onCancel} aria-label="关闭">
          关闭
        </button>
      </div>

      <div className="grid" style={{ gap: 12 }}>
        <div className="field" style={{ margin: 0 }}>
          <label>事项名称</label>
          <input
            placeholder="自习、组会、实验预约…"
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            style={inputStyle}
          />
        </div>

        <div
          className="grid"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}
        >
          <div className="field" style={{ margin: 0 }}>
            <label>星期</label>
            <select
              value={draft.dayOfWeek}
              onChange={(e) => setDraft((d) => ({ ...d, dayOfWeek: Number(e.target.value) }))}
              className="dash-select"
              style={{ width: "100%" }}
            >
              {WEEKDAYS.map((w, i) => (
                <option key={w} value={i + 1}>
                  {w}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>开始节次</label>
            <select
              value={draft.periodStart}
              onChange={(e) => {
                const periodStart = Number(e.target.value);
                setDraft((d) => ({
                  ...d,
                  periodStart,
                  periodEnd: Math.max(periodStart, d.periodEnd),
                }));
              }}
              className="dash-select"
              style={{ width: "100%" }}
            >
              {PERIOD_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  第 {p} 节
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>结束节次</label>
            <select
              value={draft.periodEnd}
              onChange={(e) => setDraft((d) => ({ ...d, periodEnd: Number(e.target.value) }))}
              className="dash-select"
              style={{ width: "100%" }}
            >
              {PERIOD_OPTIONS.filter((p) => p >= draft.periodStart)
                .map((p) => (
                  <option key={p} value={p}>
                    第 {p} 节
                  </option>
                ))}
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>重复</label>
            <select
              value={draft.weekParity}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  weekParity: e.target.value as CustomEventDraft["weekParity"],
                }))
              }
              className="dash-select"
              style={{ width: "100%" }}
            >
              <option value="all">每周</option>
              <option value="odd">单周</option>
              <option value="even">双周</option>
            </select>
          </div>
        </div>

        <div className="field" style={{ margin: 0 }}>
          <label>地点</label>
          <input
            placeholder="教室、线上会议链接等"
            value={draft.room}
            onChange={(e) => setDraft((d) => ({ ...d, room: e.target.value }))}
            style={inputStyle}
          />
        </div>

        <div className="field" style={{ margin: 0 }}>
          <label>备注</label>
          <textarea
            rows={3}
            placeholder="补充说明、参与人、准备材料等"
            value={draft.note}
            onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
            style={{ ...inputStyle, resize: "vertical" }}
          />
        </div>

        <div>
          <label style={{ display: "block", marginBottom: 8, fontSize: 13, fontWeight: 600 }}>
            课表块颜色
          </label>
          <div className="color-palette">
            {CUSTOM_EVENT_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                className={`color-swatch${draft.color === c.value ? " color-swatch--active" : ""}`}
                style={{ background: c.value }}
                title={c.label}
                aria-label={c.label}
                onClick={() => setDraft((d) => ({ ...d, color: c.value }))}
              />
            ))}
          </div>
        </div>

        <div className="row" style={{ flexWrap: "wrap", gap: 8, marginTop: 4 }}>
          <button type="button" className="btn primary" onClick={onSave} disabled={!draft.title.trim()}>
            {saveLabel ?? (mode === "add" ? "添加" : "保存")}
          </button>
          <button type="button" className="btn" onClick={onCancel}>
            取消
          </button>
          {mode === "edit" && onDelete ? (
            <button
              type="button"
              className="btn"
              style={{ marginLeft: "auto", color: "#b91c1c", borderColor: "#fecaca" }}
              onClick={onDelete}
            >
              删除事项
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
