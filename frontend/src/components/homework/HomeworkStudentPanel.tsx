import ReactMarkdown from "react-markdown";
import { attachmentDownloadUrl } from "./homeworkFormApi";

type Attachment = { id: string; fileName: string; sizeBytes: number };
type RubricItem = { name: string; maxScore: number };

type Props = {
  homework: {
    id: string;
    title: string;
    description?: string | null;
    descriptionMd?: string | null;
    dueAt?: string | null;
    requirementsUpdatedAt?: string | null;
    allowLate?: boolean;
    latePenaltyPercentPerDay?: number | null;
    lateMaxDays?: number | null;
    allowRedo?: boolean;
    maxRedoCount?: number | null;
    submissionType?: string;
    maxGroupSize?: number | null;
    rubric?: RubricItem[];
    rubricFileName?: string | null;
    attachments?: Attachment[];
  };
};

export default function HomeworkStudentPanel({ homework: h }: Props) {
  const md = h.descriptionMd ?? h.description ?? "";
  const rubric = h.rubric ?? [];

  return (
    <div className="card grid" style={{ marginTop: 10, boxShadow: "none" }}>
      {h.requirementsUpdatedAt ? (
        <div
          style={{
            padding: "10px 12px",
            borderRadius: 8,
            background: "#fff7ed",
            color: "#9a3412",
            fontSize: 13,
          }}
        >
          作业要求已更新（{new Date(h.requirementsUpdatedAt).toLocaleString()}），请查看最新说明。
        </div>
      ) : null}

      {md ? (
        <div style={{ fontSize: 14, lineHeight: 1.65 }}>
          <ReactMarkdown>{md}</ReactMarkdown>
        </div>
      ) : null}

      {h.attachments && h.attachments.length > 0 ? (
        <div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>附件</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
            {h.attachments.map((a) => (
              <li key={a.id}>
                <a href={attachmentDownloadUrl(h.id, a.id)} target="_blank" rel="noreferrer">
                  {a.fileName}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
        {h.submissionType === "GROUP" ? `小组作业（最多 ${h.maxGroupSize ?? 4} 人）` : "个人作业"}
        {h.allowLate
          ? ` · 允许迟交（每日扣最高分的 ${h.latePenaltyPercentPerDay ?? 10}%，超过 ${h.lateMaxDays ?? 3} 天按 0 分）`
          : " · 不允许迟交"}
        {h.allowRedo
          ? ` · 允许重做（${
              h.maxRedoCount === -1 ? "无限次" : `最多 ${h.maxRedoCount ?? 1} 次`
            }）`
          : null}
      </div>

      {rubric.length > 0 ? (
        <div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>评分维度</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
            {rubric.map((r, i) => (
              <li key={i}>
                {r.name}：{r.maxScore} 分
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {h.rubricFileName ? (
        <div className="muted" style={{ fontSize: 13 }}>
          评分标准文件：{h.rubricFileName}（请向教师索取或于课程资料中查看）
        </div>
      ) : null}
    </div>
  );
}
