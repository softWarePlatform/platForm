import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import MentionComposer, { getMentionIdsForSubmit } from "./MentionComposer";
import type { MentionMember } from "./mentionUtils";
import {
  MAX_DISCUSSION_ATTACHMENTS,
  uploadDiscussionPostAttachments,
  validateDiscussionAttachment,
} from "./discussionAttachments";

type Props = {
  open: boolean;
  courseId: string;
  labId: string;
  onClose: () => void;
  onCreated: () => void;
};

export default function DiscussionPostModal({
  open,
  courseId,
  labId,
  onClose,
  onCreated,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [members, setMembers] = useState<MentionMember[]>([]);
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setBody("");
    setAnonymous(false);
    setMentionIds([]);
    setPendingFiles([]);
    setErr(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    void api
      .get<{ members: MentionMember[] }>(`/courses/${courseId}/discussion-members`)
      .then(({ data }) => setMembers(data.members ?? []))
      .catch(() => setMembers([]));
  }, [open, courseId]);

  if (!open) return null;

  function addFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    setErr(null);
    const next = [...pendingFiles];
    for (const file of Array.from(fileList)) {
      if (next.length >= MAX_DISCUSSION_ATTACHMENTS) {
        setErr(`最多上传 ${MAX_DISCUSSION_ATTACHMENTS} 个附件`);
        break;
      }
      const validationErr = validateDiscussionAttachment(file);
      if (validationErr) {
        setErr(validationErr);
        continue;
      }
      if (next.some((f) => f.name === file.name && f.size === file.size)) continue;
      next.push(file);
    }
    setPendingFiles(next);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function publish() {
    setSaving(true);
    setErr(null);
    try {
      const { data } = await api.post<{ post: { id: string } }>(`/labs/${labId}/discussions`, {
        title: title.trim(),
        body: body.trim(),
        anonymous,
        mentionUserIds: getMentionIdsForSubmit(body.trim(), members, mentionIds),
      });
      if (pendingFiles.length > 0) {
        await uploadDiscussionPostAttachments(labId, data.post.id, pendingFiles);
      }
      onCreated();
      onClose();
    } catch (e: unknown) {
      const msg =
        typeof e === "object" && e !== null && "response" in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : null;
      setErr(msg ?? "发布失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="card modal-panel"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginTop: 0 }}>我要提问</h3>
        <div className="field">
          <label>标题</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label>内容（支持 Markdown，输入 @ 提醒成员）</label>
          <MentionComposer
            courseId={courseId}
            value={body}
            onChange={setBody}
            mentionUserIds={mentionIds}
            onMentionUserIdsChange={setMentionIds}
            rows={8}
            placeholder="描述你的问题，输入 @ 选择要提醒的人"
          />
        </div>
        <div className="field">
          <label>附件（可选）</label>
          <div className="row" style={{ flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              disabled={saving || pendingFiles.length >= MAX_DISCUSSION_ATTACHMENTS}
              onChange={(e) => addFiles(e.target.files)}
            />
            <span className="muted" style={{ fontSize: 12 }}>
              最多 {MAX_DISCUSSION_ATTACHMENTS} 个，单文件 10MB
            </span>
          </div>
          {pendingFiles.length > 0 ? (
            <ul className="disc-attach-list">
              {pendingFiles.map((f, i) => (
                <li key={`${f.name}-${f.size}-${i}`} className="disc-attach-list__item">
                  <span className="disc-attach-list__name">{f.name}</span>
                  <span className="muted disc-attach-list__size">
                    {(f.size / 1024).toFixed(1)} KB
                  </span>
                  <button
                    type="button"
                    className="btn disc-attach-list__remove"
                    disabled={saving}
                    onClick={() => setPendingFiles((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    移除
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <label className="row" style={{ gap: 8, fontSize: 14 }}>
          <input
            type="checkbox"
            checked={anonymous}
            onChange={(e) => setAnonymous(e.target.checked)}
          />
          匿名发帖
        </label>
        {err ? <div className="err" style={{ marginTop: 10 }}>{err}</div> : null}
        <div className="row" style={{ marginTop: 16, gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="btn" onClick={onClose} disabled={saving}>
            取消
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={saving || !title.trim() || !body.trim()}
            onClick={() => void publish()}
          >
            {saving ? "发布中…" : "发布"}
          </button>
        </div>
      </div>
    </div>
  );
}
