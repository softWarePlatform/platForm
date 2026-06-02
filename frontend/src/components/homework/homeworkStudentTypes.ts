export type StudentHomeworkStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "SUBMITTED"
  | "LOCKED"
  | "OVERDUE"
  | "RETURNED"
  | "REDO_PENDING";

export type HomeworkListStudentMeta = {
  myStatus?: StudentHomeworkStatus;
  myStatusLabel?: string;
  myScore?: number | null;
  returnReason?: string | null;
  redoRemaining?: number | null;
};

export type StudentFileRow = {
  id: string;
  fileName: string;
  sizeBytes: number;
};

export type SubmissionVersionRow = {
  id: string;
  version: number;
  submittedAt: string;
  isLate?: boolean;
  lateDays?: number | null;
  score?: number | null;
};

export type StudentHomeworkView = {
  homework: {
    id: string;
    title: string;
    dueAt?: string | null;
    answerMode?: string;
    allowMultipleSubmits?: boolean;
    requireAttachment?: boolean;
    allowLate?: boolean;
    latePenaltyPercentPerDay?: number | null;
    lateMaxDays?: number | null;
    allowRedo?: boolean;
    maxRedoCount?: number | null;
    redoReasonRequired?: boolean;
    requirementsUpdatedAt?: string | null;
  };
  student: {
    status: StudentHomeworkStatus;
    statusLabel: string;
    canEdit: boolean;
    canSubmit: boolean;
    lateHint?: string | null;
    returnReason?: string | null;
    redoRemaining?: number | null;
    score?: number | null;
    feedback?: string | null;
    draftContent: string;
    content: string;
    requirementsReadAt?: string | null;
    submittedAt?: string | null;
    locked: boolean;
    versions: SubmissionVersionRow[];
    files: StudentFileRow[];
    released?: boolean;
    allowRedoRequest?: boolean;
    redoExhausted?: boolean;
    pendingRedo?: { id: string; reason?: string | null; createdAt: string } | null;
  };
};
