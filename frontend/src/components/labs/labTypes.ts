export type LabJudgeConfig = {
  judgeMode: "AUTO" | "MANUAL";
  allowedLanguages: string[];
  allowedFileExtensions: string[];
};

export type LabDetail = {
  id: string;
  title: string;
  description?: string | null;
  descriptionMd?: string | null;
  language: string;
  starterCode?: string | null;
  judgeConfig: LabJudgeConfig;
  labSet?: {
    id: string;
    title?: string;
    access?: { canSubmit?: boolean };
  };
  testCases?: Array<{ id: string; input: string; expected: string }>;
};

export type SubmissionRow = {
  id: string;
  status: string;
  score: number | null;
  createdAt: string;
  submissionKind?: string;
  fileName?: string | null;
  language?: string | null;
};

export type TestCaseDetail = {
  testCaseId?: string;
  pass?: boolean;
  hidden?: boolean;
  input?: string;
  expected?: string;
  got?: string;
  stderr?: string;
  error?: string;
};

export type SubmissionFeedback = {
  submission?: SubmissionRow;
  feedback?: {
    details?: TestCaseDetail[];
    last?: { testCaseId?: string; error?: string; stderr?: string } | null;
    note?: string | null;
  };
};
