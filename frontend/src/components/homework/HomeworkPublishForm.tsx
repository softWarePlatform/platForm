import { FormEvent, useEffect, useState } from "react";
import { api } from "../../api/client";
import HomeworkFormFields from "./HomeworkFormFields";
import { uploadHomeworkAttachments, uploadHomeworkRubricFile } from "./homeworkFormApi";
import { emptyHomeworkForm, formValuesToPayload, type HomeworkFormValues } from "./homeworkFormTypes";

type ClassRow = { id: string; name: string };

type Props = {
  courseId: string;
  onCreated: () => void | Promise<void>;
  setErr: (msg: string | null) => void;
};

export default function HomeworkPublishForm({ courseId, onCreated, setErr }: Props) {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [values, setValues] = useState<HomeworkFormValues>(emptyHomeworkForm);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pendingRubricFile, setPendingRubricFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [createOk, setCreateOk] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get(`/courses/${courseId}/classes`);
        if (!cancelled) setClasses(data.classes ?? []);
      } catch {
        if (!cancelled) setClasses([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId]);

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
    setErr(null);
    setBusy(true);
    try {
      const { data } = await api.post(`/courses/${courseId}/homework`, formValuesToPayload(values, { includePublish: true }));
      const hwId = data.homework?.id as string;
      if (hwId && pendingFiles.length) await uploadHomeworkAttachments(hwId, pendingFiles);
      if (hwId && pendingRubricFile) await uploadHomeworkRubricFile(hwId, pendingRubricFile);
      setValues(emptyHomeworkForm());
      setPendingFiles([]);
      setPendingRubricFile(null);
      setCreateOk(true);
      window.setTimeout(() => setCreateOk(false), 3000);
      await onCreated();
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

  return (
    <form className="homework-publish-form" onSubmit={(e) => void onSubmit(e)}>
      <HomeworkFormFields
        courseId={courseId}
        values={values}
        onChange={setValues}
        classes={classes}
        pendingFiles={pendingFiles}
        onPendingFilesChange={setPendingFiles}
        pendingRubricFile={pendingRubricFile}
        onPendingRubricFileChange={setPendingRubricFile}
      />

      <div className="form-actions form-actions--bar">
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? "保存中…" : "保存作业"}
        </button>
        {createOk ? <span className="save-ok">已保存</span> : null}
      </div>
    </form>
  );
}
