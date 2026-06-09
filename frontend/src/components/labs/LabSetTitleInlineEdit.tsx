import { useEffect, useState } from "react";
import { api } from "../../api/client";

type Props = {
  courseId: string;
  labSetId: string;
  title: string;
  onRenamed: (newTitle: string) => void;
  onError?: (message: string) => void;
};

export default function LabSetTitleInlineEdit({
  courseId,
  labSetId,
  title,
  onRenamed,
  onError,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(title);
  }, [title, editing]);

  async function save() {
    const next = draft.trim();
    if (!next) {
      onError?.("标题不能为空");
      return;
    }
    if (next === title) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await api.patch(`/courses/${courseId}/lab-sets/${labSetId}`, { title: next });
      onRenamed(next);
      setEditing(false);
    } catch (e: unknown) {
      const msg =
        typeof e === "object" && e !== null && "response" in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : null;
      onError?.(msg ?? "重命名失败");
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setDraft(title);
    setEditing(false);
  }

  if (!editing) {
    return (
      <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>{title}</h2>
        <button type="button" className="btn" style={{ fontSize: 13, padding: "4px 10px" }} onClick={() => setEditing(true)}>
          重命名
        </button>
      </div>
    );
  }

  return (
    <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap", maxWidth: 520 }}>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void save();
          if (e.key === "Escape") cancel();
        }}
        autoFocus
        style={{ flex: 1, minWidth: 200, fontSize: 20, fontWeight: 700, padding: "6px 10px" }}
      />
      <button type="button" className="btn primary" disabled={saving} onClick={() => void save()}>
        {saving ? "保存中…" : "保存"}
      </button>
      <button type="button" className="btn" disabled={saving} onClick={cancel}>
        取消
      </button>
    </div>
  );
}
