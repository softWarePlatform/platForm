export const PRACTICE_TYPE_LABEL: Record<string, string> = {
  CHOICE: "选择题",
  FILL: "填空题",
  SHORT_ANSWER: "简答题",
  CODE: "编程题",
};

export const PRACTICE_MODE_LABEL: Record<string, string> = {
  SMART: "智能组卷",
  BY_TAG: "按知识点",
  WRONG_BOOK: "错题练习",
  CUSTOM: "自定义",
};

export const PRACTICE_STATUS_LABEL: Record<string, string> = {
  IN_PROGRESS: "进行中",
  SUBMITTED: "已提交",
  GRADED: "已完成",
};

export const PRACTICE_DIFF_LABEL: Record<string, string> = {
  EASY: "简单",
  MEDIUM: "中等",
  HARD: "困难",
};

export const FEEDBACK_TYPE_LABEL: Record<string, string> = {
  STEM_ERROR: "题干错误",
  ANSWER_ERROR: "答案错误",
  EXPLANATION_ERROR: "解析错误",
  TOO_HARD: "太难",
  TOO_EASY: "太简单",
  UNCLEAR: "表述不清",
  SUGGEST_KNOWLEDGE: "建议补充知识点",
};
