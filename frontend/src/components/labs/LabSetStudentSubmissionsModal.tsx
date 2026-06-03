import { useEffect, useState } from "react";
import { api } from "../../api/client";

type Problem = {
  labId: string;
  title: string;
  submission: {
    id: string;
    status: string;
    score: number | null;
    fileName: string | null;
    hasFile: boolean;
    teacherComment: string | null;
    returnReason: string | null;
  } | null;
};

type Props = {
  open: boolean;
  courseId: string;
  labSetId: string;
  userId: string;
  studentName: string;
  onClose: () => void;
};

export default function LabSetStudentSubmissionsModal({
  open,
  courseId,
  labSetId,
  userId,
  studentName,
  onClose,
}: Props) {
  const [problems, setProblems] = useState<Problem[]>([]);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [returnReasons, setReturnReasons] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    void api
      .get<{ problems: Problem[] }>(
        `/courses/${courseId}/lab-sets/${labSetId}/students/${userId}/submissions`,
      )
      .then(({ data }) => {
        setProblems(data.problems ?? []);
        const sc: Record<string, string> = {};
        const cm: Record<string, string> = {};
        for (const p of data.problems ?? []) {
          if (p.submission) {
            sc[p.labId] = p.submission.score != null ? String(p.submission.score) : "";
            cm[p.labId] = p.submission.teacherComment ?? "";
          }
        }
        setScores(sc);
        setComments(cm);
        const rr: Record<string, string> = {};
        for (const p of data.problems ?? []) {
          if (p.submission?.returnReason) rr[p.labId] = p.submission.returnReason;
        }
        setReturnReasons(rr);
      });
  }, [open, courseId, labSetId, userId]);

  async function returnSubmission(submissionId: string, labId: string) {
    const reason = returnReasons[labId]?.trim();
    if (!reason) {
      alert("请填写打回原因");
      return;
    }
    setSaving(submissionId);
    try {
      await api.patch(`/submissions/${submissionId}/return`, { returnReason: reason });
      alert("已打回，学生将收到通知");
    } finally {
      setSaving(null);
    }
  }

  if (!open) return null;

  async function grade(submissionId: string, labId: string) {
    const score = Number(scores[labId]);
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      alert("请输入 0～100 的分数");
      return;
    }
    setSaving(submissionId);
    try {
      await api.patch(`/submissions/${submissionId}/grade`, {
        score,
        teacherComment: comments[labId] || null,
        status: "ACCEPTED",
      });
      alert("已保存");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="card modal-panel modal-panel--wide"
        role="dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginTop: 0 }}>学生提交 · {studentName}</h3>
        <div className="grid" style={{ gap: 14, maxHeight: "70vh", overflow: "auto" }}>
          {problems.map((p) => (
            <div key={p.labId} style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
              <div style={{ fontWeight: 800 }}>{p.title}</div>
              {!p.submission ? (
                <div className="muted" style={{ marginTop: 6 }}>
                  暂无提交
                </div>
              ) : (
                <>
                  <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                    状态：{p.submission.status}
                    {p.submission.fileName ? ` · 文件：${p.submission.fileName}` : ""}
                  </div>
                  {p.submission.hasFile ? (
                    <a
                      className="btn"
                      style={{ marginTop: 8, display: "inline-flex" }}
                      href={`/api/submissions/${p.submission.id}/download`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      下载提交文件
                    </a>
                  ) : null}
                  {p.submission.returnReason ? (
                    <div className="practice-ai-notice" style={{ marginTop: 8 }}>
                      已打回：{p.submission.returnReason}
                    </div>
                  ) : null}
                  <div className="row" style={{ marginTop: 10, gap: 8, flexWrap: "wrap" }}>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      placeholder="分数"
                      style={{ width: 88 }}
                      value={scores[p.labId] ?? ""}
                      onChange={(e) =>
                        setScores((s) => ({ ...s, [p.labId]: e.target.value }))
                      }
                    />
                    <input
                      placeholder="评语"
                      style={{ flex: 1, minWidth: 140 }}
                      value={comments[p.labId] ?? ""}
                      onChange={(e) =>
                        setComments((c) => ({ ...c, [p.labId]: e.target.value }))
                      }
                    />
                    <button
                      type="button"
                      className="btn primary"
                      disabled={saving === p.submission.id}
                      onClick={() => void grade(p.submission!.id, p.labId)}
                    >
                      保存打分
                    </button>
                    <input
                      placeholder="打回原因"
                      style={{ flex: 1, minWidth: 140 }}
                      value={returnReasons[p.labId] ?? ""}
                      onChange={(e) =>
                        setReturnReasons((r) => ({ ...r, [p.labId]: e.target.value }))
                      }
                    />
                    <button
                      type="button"
                      className="btn"
                      style={{ color: "var(--danger)" }}
                      disabled={saving === p.submission.id}
                      onClick={() => void returnSubmission(p.submission!.id, p.labId)}
                    >
                      打回重做
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 16, textAlign: "right" }}>
          <button type="button" className="btn" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
