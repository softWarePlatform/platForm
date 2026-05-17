export type MaterialRow = {
  id: string;
  title: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number;
  folderPath: string;
  visibility: "ALL" | "CLASS" | "TEACHER_ONLY";
  targetClassId: string | null;
  pinned: boolean;
  groupId: string;
  version: number;
  isCurrent?: boolean;
  downloadCount: number;
  lastDownloadAt: string | null;
  createdAt: string;
  updatedAt: string;
  fileType: string;
  previewable: boolean;
  favorited: boolean;
  uploadedBy: { id: string; name: string };
  targetClass: { id: string; name: string } | null;
};

export type MaterialsListResponse = {
  materials: MaterialRow[];
  folders: string[];
  classes: Array<{ id: string; name: string }>;
  isManager: boolean;
};

export type MaterialVersionRow = MaterialRow & { isCurrent: boolean };
