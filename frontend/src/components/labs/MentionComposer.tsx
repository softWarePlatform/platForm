import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../api/client";
import type { MentionMember } from "./mentionUtils";
import { mergeMentionIds, parseMentionUserIds } from "./mentionUtils";

type Props = {
  courseId: string;
  value: string;
  onChange: (value: string) => void;
  mentionUserIds?: string[];
  onMentionUserIdsChange?: (ids: string[]) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  autoFocus?: boolean;
};

type MentionState = {
  start: number;
  query: string;
};

export default function MentionComposer({
  courseId,
  value,
  onChange,
  mentionUserIds = [],
  onMentionUserIdsChange,
  placeholder = "输入内容，输入 @ 可提醒他人",
  rows = 4,
  disabled = false,
  autoFocus = false,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [members, setMembers] = useState<MentionMember[]>([]);
  const [mention, setMention] = useState<MentionState | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    void api
      .get<{ members: MentionMember[] }>(`/courses/${courseId}/discussion-members`)
      .then(({ data }) => setMembers(data.members ?? []))
      .catch(() => setMembers([]));
  }, [courseId]);

  const filtered = useMemo(() => {
    if (!mention) return [];
    const q = mention.query.toLowerCase();
    return members.filter((m) => m.name.toLowerCase().includes(q)).slice(0, 8);
  }, [mention, members]);

  const displayedMentionIds = useMemo(
    () => mergeMentionIds(mentionUserIds, parseMentionUserIds(value, members)),
    [mentionUserIds, value, members],
  );

  function detectMention(text: string, cursor: number) {
    const before = text.slice(0, cursor);
    const at = before.lastIndexOf("@");
    if (at < 0) {
      setMention(null);
      return;
    }
    const segment = before.slice(at + 1);
    if (segment.includes("\n") || segment.includes(" ")) {
      setMention(null);
      return;
    }
    setMention({ start: at, query: segment });
    setActiveIndex(0);
  }

  function insertMention(member: MentionMember) {
    const el = textareaRef.current;
    if (!el || !mention) return;
    const cursor = el.selectionStart ?? value.length;
    const before = value.slice(0, mention.start);
    const after = value.slice(cursor);
    const insert = `@${member.name} `;
    const next = `${before}${insert}${after}`;
    const nextIds = mergeMentionIds(mentionUserIds, [member.id], parseMentionUserIds(next, members));
    onChange(next);
    onMentionUserIdsChange?.(nextIds);
    setMention(null);
    requestAnimationFrame(() => {
      const pos = before.length + insert.length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }

  function handleChange(text: string) {
    onChange(text);
    const el = textareaRef.current;
    const cursor = el?.selectionStart ?? text.length;
    detectMention(text, cursor);
    onMentionUserIdsChange?.(mergeMentionIds(mentionUserIds, parseMentionUserIds(text, members)));
  }

  return (
    <div className="mention-composer">
      <textarea
        ref={textareaRef}
        rows={rows}
        className="mention-composer__input"
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        autoFocus={autoFocus}
        onChange={(e) => handleChange(e.target.value)}
        onClick={(e) => detectMention(value, e.currentTarget.selectionStart)}
        onKeyUp={(e) => detectMention(value, e.currentTarget.selectionStart)}
        onKeyDown={(e) => {
          if (!mention || filtered.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex((i) => (i + 1) % filtered.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length);
          } else if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            insertMention(filtered[activeIndex]!);
          } else if (e.key === "Escape") {
            setMention(null);
          }
        }}
      />
      {mention && filtered.length > 0 ? (
        <ul className="mention-composer__picker" role="listbox">
          {filtered.map((m, i) => (
            <li key={m.id} role="option" aria-selected={i === activeIndex}>
              <button
                type="button"
                className={
                  i === activeIndex
                    ? "mention-composer__pick mention-composer__pick--active"
                    : "mention-composer__pick"
                }
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertMention(m);
                }}
              >
                <span className="mention-composer__pick-name">@{m.name}</span>
                {m.isTeacher ? <span className="disc-badge disc-badge--teacher">老师</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : mention && filtered.length === 0 ? (
        <div className="mention-composer__picker mention-composer__picker--empty">无匹配成员</div>
      ) : null}
      {displayedMentionIds.length > 0 ? (
        <div className="mention-composer__chips muted">
          将提醒：
          {displayedMentionIds
            .map((id) => members.find((m) => m.id === id)?.name ?? id.slice(0, 6))
            .join("、")}
        </div>
      ) : null}
    </div>
  );
}

export function getMentionIdsForSubmit(
  text: string,
  members: MentionMember[],
  picked: string[],
): string[] {
  return mergeMentionIds(picked, parseMentionUserIds(text, members));
}
