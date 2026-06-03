/** 学生端题目/提交状态文案（对齐 docs/实验管理.md） */
export function formatLabSubmissionStatus(
  status: string | null | undefined,
  opts?: { returnReason?: string | null; passed?: boolean },
): string {
  if (opts?.returnReason) return "已打回";
  if (opts?.passed) return "已完成";
  if (!status || status === "—") return "未开始";
  switch (status) {
    case "PENDING":
    case "JUDGING":
      return "评测中";
    case "PENDING_REVIEW":
      return "已提交";
    case "ACCEPTED":
      return "已完成";
    case "WRONG_ANSWER":
    case "ERROR":
    case "TIMEOUT":
      return "已提交";
    default:
      return status;
  }
}

export function labSubmissionStatusClass(label: string): string {
  if (label === "已完成") return "lab-status--ok";
  if (label === "已打回") return "lab-status--warn";
  if (label === "评测中") return "lab-status--pending";
  if (label === "未开始") return "lab-status--muted";
  return "lab-status--default";
}
