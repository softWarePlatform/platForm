import { FormEvent, useState } from "react";
import "../../../pages/enrollment/enrollment.css";
import {
  PRACTICE_TAG_MATCH_HINTS,
  PRACTICE_TAG_MATCH_LABELS,
  PRACTICE_TAG_MATCH_MODES,
  type PracticeTagMatchMode,
} from "./practiceTagFilter";

type Props = {
  tags: string[];
  selectedTags: string[];
  mode: PracticeTagMatchMode;
  onSelectedTagsChange: (tags: string[]) => void;
  onModeChange: (mode: PracticeTagMatchMode) => void;
  onCreateTag?: (tagPath: string) => Promise<void>;
  createBusy?: boolean;
};

function toggle(list: string[], value: string) {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

export default function PracticeTagFilterPanel({
  tags,
  selectedTags,
  mode,
  onSelectedTagsChange,
  onModeChange,
  onCreateTag,
  createBusy,
}: Props) {
  const [newTag, setNewTag] = useState("");

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!onCreateTag) return;
    const path = newTag.trim();
    if (!path) return;
    await onCreateTag(path);
    if (!selectedTags.includes(path)) onSelectedTagsChange([...selectedTags, path]);
    setNewTag("");
  }

  return (
    <div className="enroll-filter-panel practice-tag-filter">
      <div className="enroll-filter-head">
        <span className="enroll-filter-title">知识点标签</span>
        <div className="enroll-filter-tabs practice-tag-filter__modes">
          {PRACTICE_TAG_MATCH_MODES.map((m) => (
            <button
              key={m}
              type="button"
              className={`enroll-filter-tab${mode === m ? " active" : ""}`}
              onClick={() => onModeChange(m)}
              title={PRACTICE_TAG_MATCH_HINTS[m]}
            >
              {PRACTICE_TAG_MATCH_LABELS[m]}
            </button>
          ))}
        </div>
        {selectedTags.length > 0 ? (
          <button type="button" className="enroll-filter-clear-all" onClick={() => onSelectedTagsChange([])}>
            清除已选
          </button>
        ) : null}
      </div>

      <p className="enroll-filter-hint muted" style={{ margin: "0 0 10px" }}>
        {PRACTICE_TAG_MATCH_HINTS[mode]}
      </p>

      <div className="enroll-filter-body">
        <button
          type="button"
          className={`enroll-filter-option${selectedTags.length === 0 ? " selected" : ""}`}
          onClick={() => onSelectedTagsChange([])}
        >
          不限
        </button>
        {tags.map((tag) => (
          <button
            key={tag}
            type="button"
            className={`enroll-filter-option${selectedTags.includes(tag) ? " selected" : ""}`}
            onClick={() => onSelectedTagsChange(toggle(selectedTags, tag))}
            title={tag}
          >
            {tag}
          </button>
        ))}
      </div>

      {onCreateTag ? (
        <form className="practice-tag-filter__create row" onSubmit={(e) => void handleCreate(e)} style={{ marginTop: 12, gap: 8 }}>
          <input
            className="field"
            style={{ flex: 1, margin: 0 }}
            placeholder="新建标签，多级用 > 分隔，如：程序设计 > 基础"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
          />
          <button type="submit" className="btn primary" disabled={createBusy || !newTag.trim()}>
            {createBusy ? "保存中…" : "新建标签"}
          </button>
        </form>
      ) : null}

      {selectedTags.length > 0 ? (
        <div className="enroll-filter-applied">
          <span className="enroll-filter-applied-label">
            已选（{PRACTICE_TAG_MATCH_LABELS[mode]}）：
          </span>
          {selectedTags.map((tag) => (
            <span key={tag} className="enroll-filter-tag">
              {tag}
              <button type="button" aria-label="remove" onClick={() => onSelectedTagsChange(selectedTags.filter((x) => x !== tag))}>
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
