import { FormEvent, useState } from "react";

type Props = {
  tags: string[];
  onCreateTag: (tagPath: string) => Promise<void>;
  createBusy?: boolean;
};

export default function PracticeTagManagePanel({ tags, onCreateTag, createBusy }: Props) {
  const [newTag, setNewTag] = useState("");

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    const path = newTag.trim();
    if (!path) return;
    await onCreateTag(path);
    setNewTag("");
  }

  return (
    <div className="card grid practice-tag-manage">
      <div style={{ fontWeight: 700 }}>知识点标签管理</div>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        教师在此新建标签；出题或导入时为题目选择标签。
      </p>
      <form className="row" onSubmit={(e) => void handleCreate(e)} style={{ gap: 8, flexWrap: "wrap" }}>
        <input
          className="field"
          style={{ flex: 1, minWidth: 200, margin: 0 }}
          placeholder="新建标签，多级用 > 分隔"
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
        />
        <button type="submit" className="btn primary" disabled={createBusy || !newTag.trim()}>
          {createBusy ? "保存中…" : "新建标签"}
        </button>
      </form>
      <div className="practice-tag-manage__list">
        {tags.length === 0 ? (
          <span className="muted">暂无标签，请先新建</span>
        ) : (
          tags.map((t) => (
            <span key={t} className="practice-badge">
              {t}
            </span>
          ))
        )}
      </div>
    </div>
  );
}
