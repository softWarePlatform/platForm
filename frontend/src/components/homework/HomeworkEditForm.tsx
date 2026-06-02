import { FormEvent, useState } from "react";
import { api } from "../../api/client";
import HomeworkFormFields from "./HomeworkFormFields";
import {
  attachmentDownloadUrl,
  uploadHomeworkAttachments,
  uploadHomeworkRubricFile,
} from "./homeworkFormApi";
import {
  formValuesToPayload,
  homeworkToFormValues,
  type HomeworkAttachmentRow,
  type HomeworkFormValues,
} from "./homeworkFormTypes";

type ClassRow = { id: string; name: string };

type HomeworkRow = {
  id: string;
  title: string;
  description?: string | null;
  descriptionMd?: string | null;
  dueAt?: string | null;
  targetClassId?: string | null;
  attachments?: HomeworkAttachmentRow[];
  rubricFileName?: string | null;
  [key: string]: unknown;
};

type Props = {
  courseId: string;
  homework: HomeworkRow;
  classes: ClassRow[];
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
  setErr: (msg: string | null) => void;
};

export default function HomeworkEditForm({ courseId, homework, classes, onCancel, onSaved, setErr }: Props) {
  const [values, setValues] = useState<HomeworkFormValues>(() => homeworkToFormValues(homework));
  const [attachments, setAttachments] = useState<HomeworkAttachmentRow[]>(homework.attachments ?? []);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pendingRubricFile, setPendingRubricFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = values.title.trim();
    if (!trimmed) {
      setErr("请填写作业标题");
      return;
    }
    if (trimmed.length > 100) {
      setErr("标题不能超过 100 个字符");
      return;
    }
    if (values.audience === "class" && !values.targetClassId) {
      setErr("请选择班级");
      return;
    }
    const nextDue = values.dueAt ? new Date(values.dueAt) : null;
    const prevDue = homework.dueAt ? new Date(homework.dueAt) : null;
    if (nextDue && prevDue && nextDue < prevDue) {
      const ok = window.confirm("提前截止时间可能影响学生已规划的安排，是否继续？");
      if (!ok) return;
    }
    setErr(null);
    setBusy(true);
    try {
      await api.patch(`/homework/${homework.id}`, formValuesToPayload(values));
      if (pendingFiles.length) await uploadHomeworkAttachments(homework.id, pendingFiles);
      if (pendingRubricFile) await uploadHomeworkRubricFile(homework.id, pendingRubricFile);
      setPendingFiles([]);
      setPendingRubricFile(null);
      await onSaved();
    } catch (e2: unknown) {
      const msg =
        typeof e2 === "object" && e2 !== null && "response" in e2
          ? (e2 as { response?: { data?: { error?: string } } }).response?.data?.error
          : null;
      setErr(msg ?? "保存失败");
    } finally {
      setBusy(false);
    }
  }

  async function deleteAttachment(id: string) {
    if (!window.confirm("删除该附件？")) return;
    await api.delete(`/homework/${homework.id}/attachments/${id}`);
    setAttachments((list) => list.filter((a) => a.id !== id));
  }

  return (
    <form
      className="card grid"
      style={{ marginTop: 10, boxShadow: "none", background: "var(--surface-2, #f8fafc)" }}
      onSubmit={(e) => void onSubmit(e)}
    >
      <div style={{ fontWeight: 700 }}>编辑作业要求</div>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        保存后学生会看到「作业要求已更新」提示（若修改了描述、截止、规则等）。
      </p>

      <HomeworkFormFields
        courseId={courseId}
        values={values}
        onChange={setValues}
        classes={classes}
        showPublishCheckbox={false}
        existingAttachments={attachments}
        pendingFiles={pendingFiles}
        onPendingFilesChange={setPendingFiles}
        onDeleteAttachment={(id) => void deleteAttachment(id)}
        rubricFileName={homework.rubricFileName}
        pendingRubricFile={pendingRubricFile}
        onPendingRubricFileChange={setPendingRubricFile}
      />

      {attachments.length > 0 ? (
        <div className="muted" style={{ fontSize: 12 }}>
          {attachments.map((a) => (
            <div key={a.id}>
              <a href={attachmentDownloadUrl(homework.id, a.id)} target="_blank" rel="noreferrer">
                下载 {a.fileName}
              </a>
            </div>
          ))}
        </div>
      ) : null}

      <div className="row" style={{ gap: 8 }}>
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? "保存中…" : "保存修改"}
        </button>
        <button className="btn" type="button" onClick={onCancel}>
          取消
        </button>
      </div>
    </form>
  );
}
