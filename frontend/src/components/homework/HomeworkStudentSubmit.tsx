import { useCallback, useEffect, useRef, useState } from "react";
import { getApiError } from "../../api/errors";
import { FormSkeleton } from "../layout/PageSkeleton";
import { useConfirm } from "../ui/ConfirmDialog";
import { useToast } from "../ui/Toast";
import HomeworkStudentPanel from "./HomeworkStudentPanel";
import HomeworkKnowledgePanel from "./HomeworkKnowledgePanel";
import {
  deleteStudentHomework,
  deleteStudentHomeworkFile,
  fetchMyHomeworkStatus,
  requestHomeworkRedo,
  saveHomeworkDraft,
  studentFileDownloadUrl,
  submitHomework,
  uploadStudentHomeworkFile,
} from "./homeworkStudentApi";
import { isAllowedHomeworkFile } from "./homeworkFormApi";
import type { StudentHomeworkView } from "./homeworkStudentTypes";

type Props = {
  homework: any;
  onRefresh: () => Promise<void>;
  setErr: (e: string | null) => void;
};

const draftKey = (id: string) => `hw-draft:${id}`;

export default function HomeworkStudentSubmit({ homework: h, onRefresh, setErr }: Props) {
  const { confirm } = useConfirm();
  const { success: toastSuccess } = useToast();
  const [view, setView] = useState<StudentHomeworkView | null>(null);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState("");

  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [redoReason, setRedoReason] = useState("");
  const [expanded, setExpanded] = useState(false);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchMyHomeworkStatus(h.id);
      setView(data);
      const draft = data.student.draftContent || localStorage.getItem(draftKey(h.id)) || "";
      setContent(data.student.canEdit ? draft : data.student.content);

      setExpanded(
        data.student.status !== "NOT_STARTED" || Boolean(data.student.draftContent),
      );
    } catch (e: unknown) {
      setErr(getApiError(e, "加载作业状态失败"));
    } finally {
      setLoading(false);
    }
  }, [h.id, setErr]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!view?.student.canEdit) return;
    localStorage.setItem(draftKey(h.id), content);
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      saveHomeworkDraft(h.id, content).catch(() => {});
    }, 800);
    return () => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
    };
  }, [content, h.id, view?.student.canEdit]);

  const st = view?.student;
  const answerMode = view?.homework.answerMode ?? "RICH_TEXT";
  const showText = answerMode === "RICH_TEXT" || answerMode === "RICH_TEXT_OR_FILE";
  const showFile = answerMode === "FILE" || answerMode === "RICH_TEXT_OR_FILE";
  const statusLabel = h.myStatusLabel ?? st?.statusLabel;
  const displayScore = h.myScore ?? st?.score;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!st?.canSubmit) return;

    setErr(null);
    setBusy(true);
    setSuccess(null);
    try {
      const res = await submitHomework(h.id, {
        content: showText ? content : undefined,
        requirementsRead: true,
      });
      const msg = res.lateHint
        ? `${res.message ?? "提交成功"}（${res.lateHint}）`
        : (res.message ?? "提交成功");
      setSuccess(msg);
      toastSuccess(msg);
      localStorage.removeItem(draftKey(h.id));
      await load();
      await onRefresh();
    } catch (e2: unknown) {
      setErr(getApiError(e2, "提交失败"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="homework-submit-panel">
      <div className="homework-submit-panel__head row spread">
        <div>
          {statusLabel ? (
            <span className={`hw-status hw-status--${(h.myStatus ?? st?.status ?? "default").toLowerCase()}`}>
              {statusLabel}
            </span>
          ) : null}
          {displayScore != null ? (
            <span className="muted" style={{ marginLeft: 8, fontSize: 13 }}>
              得分：{displayScore}
            </span>
          ) : null}
        </div>
        <button type="button" className="btn" onClick={() => setExpanded((x) => !x)}>
          {expanded ? "收起" : "作答"}
        </button>
      </div>

      {(st?.status === "RETURNED" || h.myStatus === "RETURNED") && (
        <div
          style={{
            marginTop: 8,
            padding: "10px 12px",
            borderRadius: 8,
            background: "#fef2f2",
            color: "#991b1b",
            fontSize: 13,
          }}
        >
          打回原因：{st?.returnReason ?? h.returnReason ?? "无"}
          {st?.redoRemaining != null ? (
            <span style={{ marginLeft: 8 }}>剩余重做次数：{st.redoRemaining}</span>
          ) : null}
        </div>
      )}

      {st?.lateHint && st.canSubmit ? (
        <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>
          {st.lateHint}
        </div>
      ) : null}

      {success ? (
        <div
          style={{
            marginTop: 8,
            padding: "10px 12px",
            borderRadius: 8,
            background: "#ecfdf5",
            color: "#065f46",
            fontSize: 13,
          }}
        >
          {success}
        </div>
      ) : null}

      {expanded ? (
        <>
          <HomeworkStudentPanel homework={h} />
          {loading ? (
            <FormSkeleton />
          ) : (
            <form className="homework-submit-form grid" onSubmit={onSubmit}>
              {st?.locked ? (
                <div
                  className="card"
                  style={{ padding: 12, boxShadow: "none", fontSize: 14, whiteSpace: "pre-wrap" }}
                >
                  {st.content || "（附件提交）"}
                </div>
              ) : null}

              {st?.canEdit && showText ? (
                <textarea
                  rows={6}
                  placeholder="在此填写作业作答（支持 Markdown 文本）"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                />
              ) : null}

              {showFile && st?.canEdit ? (
                <div>
                  <label className="btn" style={{ cursor: "pointer", margin: 0 }}>
                    上传附件
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,.zip,.rar"
                      style={{ display: "none" }}
                      onChange={async (ev) => {
                        const f = ev.target.files?.[0];
                        ev.target.value = "";
                        if (!f || !isAllowedHomeworkFile(f.name)) return;
                        setBusy(true);
                        try {
                          await uploadStudentHomeworkFile(h.id, f);
                          await load();
                        } catch (e2: unknown) {
                          const msg =
                            typeof e2 === "object" && e2 !== null && "response" in e2
                              ? (e2 as { response?: { data?: { error?: string } } }).response?.data
                                  ?.error
                              : null;
                          setErr(msg ?? "上传失败");
                        } finally {
                          setBusy(false);
                        }
                      }}
                    />
                  </label>
                  <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 13 }}>
                    {(st?.files ?? []).map((file) => (
                      <li key={file.id}>
                        <a
                          href={studentFileDownloadUrl(h.id, file.id)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {file.fileName}
                        </a>
                        {st.canEdit ? (
                          <button
                            type="button"
                            className="btn"
                            style={{ marginLeft: 8, padding: "2px 8px", fontSize: 12 }}
                            onClick={async () => {
                              await deleteStudentHomeworkFile(h.id, file.id);
                              await load();
                            }}
                          >
                            删除
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {st?.versions && st.versions.length > 0 ? (
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>提交历史</div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                    {st.versions.map((v) => (
                      <li key={v.id}>
                        第 {v.version} 次 · {new Date(v.submittedAt).toLocaleString()}
                        {v.isLate ? ` · 迟交 ${v.lateDays ?? ""} 天` : ""}
                        {v.score != null ? ` · ${v.score} 分` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                {st?.canSubmit ? (
                  <button className="btn primary" type="submit" disabled={busy}>
                    {busy ? "提交中…" : "正式提交"}
                  </button>
                ) : null}
                {st?.canEdit ? (
                  <button
                    className="btn"
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      const ok = await confirm({
                        title: "删除作业提交",
                        message: "确定删除当前作业提交吗？删除后可重新编辑/重新提交。",
                        danger: true,
                      });
                      if (!ok) return;
                      setBusy(true);
                      setErr(null);
                      try {
                        await deleteStudentHomework(h.id);
                        localStorage.removeItem(draftKey(h.id));
                        await load();
                        await onRefresh();
                        toastSuccess("已删除提交");
                      } catch (e2: unknown) {
                        setErr(getApiError(e2, "删除失败"));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    删除作业
                  </button>
                ) : null}
              </div>

              {st?.released && st.feedback ? (
                <div className="card" style={{ padding: 12, boxShadow: "none" }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>教师评语</div>
                  <div style={{ whiteSpace: "pre-wrap", fontSize: 14 }}>{st.feedback}</div>
                </div>
              ) : null}
            </form>
          )}

          {st?.allowRedoRequest ? (
            <div style={{ marginTop: 12 }}>
              <textarea
                rows={2}
                placeholder={
                  view?.homework.redoReasonRequired ? "重做理由（必填）" : "重做理由（可选）"
                }
                value={redoReason}
                onChange={(e) => setRedoReason(e.target.value)}
              />
              <button
                type="button"
                className="btn primary"
                style={{ marginTop: 8 }}
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setErr(null);
                  try {
                    await requestHomeworkRedo(h.id, redoReason);
                    await load();
                    await onRefresh();
                  } catch (e2: unknown) {
                    setErr(getApiError(e2, "申请失败"));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                申请重做
              </button>
            </div>
          ) : null}

          <HomeworkKnowledgePanel homeworkId={h.id} visible={Boolean(st?.released)} />
        </>
      ) : null}
    </div>
  );
}
