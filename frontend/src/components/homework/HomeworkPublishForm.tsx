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
      setErr("???????");
      return;
    }
    if (trimmed.length > 100) {
      setErr("?????? 100 ???");
      return;
    }
    if (values.audience === "class" && !values.targetClassId) {
      setErr("?????????");
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
      setErr(msg ?? "??????");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card grid homework-publish-form" onSubmit={(e) => void onSubmit(e)}>
      <div className="spread" style={{ alignItems: "flex-start" }}>
        <div>
          <div style={{ fontWeight: 900 }}>{"\u53d1\u5e03\u4f5c\u4e1a"}</div>
          <p className="muted" style={{ margin: "6px 0 0", fontSize: 13, lineHeight: 1.6 }}>
            {"\u586b\u5199\u4f5c\u4e1a\u8981\u6c42\u3001\u9644\u4ef6\u4e0e\u8fdf\u4ea4/\u91cd\u505a\u89c4\u5219\uff1b\u9ed8\u8ba4\u4fdd\u5b58\u4e3a\u8349\u7a3f\u3002"}
          </p>
        </div>
        {createOk ? <span className="save-ok">{"\u5df2\u4fdd\u5b58"}</span> : null}
      </div>

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

      <div className="row" style={{ gap: 12 }}>
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? "\u4fdd\u5b58\u4e2d\u2026" : "\u4fdd\u5b58\u4f5c\u4e1a"}
        </button>
      </div>
    </form>
  );
}
