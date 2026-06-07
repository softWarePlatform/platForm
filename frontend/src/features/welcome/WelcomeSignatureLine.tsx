import { useEffect, useRef, useState } from "react";
import { getApiError } from "../../api/errors";
import { api } from "../../api/client";
import { useAuth, type User } from "../../auth/AuthContext";
import { useToast } from "../../components/ui/Toast";

const MAX_LEN = 120;

type Props = {
  /** 附加说明，如「3 门课程」 */
  meta?: string;
  /** 仅主界面允许编辑 */
  editable?: boolean;
};

function formatToday() {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date());
}

function defaultSubtitle() {
  return `今天是 ${formatToday()}`;
}

export default function WelcomeSignatureLine({ meta, editable = false }: Props) {
  const { user, token, setSession } = useAuth();
  const { success, error: toastError } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(user?.signature ?? "");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const skipBlurSave = useRef(false);

  const signature = user?.signature?.trim() ?? "";
  const displayText = signature || (editable ? "点击编写个性签名…" : defaultSubtitle());

  useEffect(() => {
    if (!editing) setDraft(user?.signature ?? "");
  }, [user?.signature, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  async function saveSignature(next: string) {
    const activeToken = token ?? localStorage.getItem("token");
    if (!activeToken) {
      toastError("请先登录");
      return;
    }

    const trimmed = next.trim();
    const normalized = trimmed.length > 0 ? trimmed.slice(0, MAX_LEN) : null;
    const current = user?.signature?.trim() || null;
    if (normalized === current) {
      setEditing(false);
      return;
    }

    setSaving(true);
    try {
      const { data } = await api.patch<{ user: User }>("/auth/me", { signature: normalized });
      if (!data?.user) throw new Error("保存失败");
      setSession(activeToken, data.user);
      setEditing(false);
      success(normalized ? "个性签名已保存" : "已清除个性签名");
    } catch (e: unknown) {
      setDraft(user?.signature ?? "");
      setEditing(false);
      toastError(getApiError(e, "个性签名保存失败"));
    } finally {
      setSaving(false);
    }
  }

  function startEdit() {
    if (!editable || saving) return;
    setDraft(user?.signature ?? "");
    setEditing(true);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      skipBlurSave.current = true;
      void saveSignature(draft);
    }
    if (e.key === "Escape") {
      skipBlurSave.current = true;
      setDraft(user?.signature ?? "");
      setEditing(false);
    }
  }

  function handleBlur() {
    if (skipBlurSave.current) {
      skipBlurSave.current = false;
      return;
    }
    void saveSignature(draft);
  }

  if (editing) {
    return (
      <form
        className="dash-welcome__signature-wrap"
        onSubmit={(e) => {
          e.preventDefault();
          skipBlurSave.current = true;
          void saveSignature(draft);
        }}
      >
        <input
          ref={inputRef}
          className="dash-welcome__signature-input"
          value={draft}
          maxLength={MAX_LEN}
          placeholder="写一句个性签名…"
          disabled={saving}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          aria-label="个性签名"
        />
        <div className="dash-welcome__signature-actions">
          <button type="submit" className="btn primary btn--sm" disabled={saving}>
            {saving ? "保存中…" : "保存"}
          </button>
          <button
            type="button"
            className="btn btn--sm"
            disabled={saving}
            onMouseDown={(e) => {
              e.preventDefault();
              skipBlurSave.current = true;
              setDraft(user?.signature ?? "");
              setEditing(false);
            }}
          >
            取消
          </button>
        </div>
      </form>
    );
  }

  return (
    <p className="dash-welcome__date">
      {editable ? (
        <button
          type="button"
          className={`dash-welcome__signature-btn${signature ? "" : " dash-welcome__signature-btn--placeholder"}`}
          onClick={startEdit}
          title="点击编辑个性签名"
        >
          {displayText}
        </button>
      ) : (
        <span>{displayText}</span>
      )}
      {meta ? <span className="dash-welcome__meta-sep"> · {meta}</span> : null}
    </p>
  );
}
