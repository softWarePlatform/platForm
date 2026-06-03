import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../api/client";

type LabFile = {
  id: string;
  title: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number;
  createdAt: string;
  uploadedBy?: { id: string; name: string };
};

type Props = {
  labId: string;
  isTeacher: boolean;
};

function formatSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function LabAttachmentsPanel({ labId, isTeacher }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<LabFile[]>([]);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await api.get<{ files: LabFile[] }>(`/labs/${labId}/files`);
    setFiles(data.files ?? []);
  }, [labId]);

  useEffect(() => {
    void load().catch(() => setFiles([]));
  }, [load]);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setErr("请选择文件");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (title.trim()) fd.append("title", title.trim());
      await api.post(`/labs/${labId}/files`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setTitle("");
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } catch (e2: unknown) {
      const msg =
        typeof e2 === "object" && e2 !== null && "response" in e2
          ? (e2 as { response?: { data?: { error?: string } } }).response?.data?.error
          : null;
      setErr(msg ?? "上传失败");
    } finally {
      setBusy(false);
    }
  }

  async function remove(fileId: string) {
    if (!confirm("确定删除该附件？")) return;
    await api.delete(`/labs/${labId}/files/${fileId}`);
    await load();
  }

  return (
    <div className="lab-attachments">
      <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
        指导书、数据文件等（可下载）
      </div>
      {files.length === 0 ? (
        <p className="muted" style={{ fontSize: 13, margin: "0 0 8px" }}>
          暂无附件
        </p>
      ) : (
        <ul className="lab-attachments__list">
          {files.map((f) => (
            <li key={f.id} className="lab-attachments__item">
              <a
                className="lab-attachments__link"
                href={`/api/labs/${labId}/files/${f.id}/download`}
                target="_blank"
                rel="noreferrer"
              >
                {f.title || f.fileName}
              </a>
              <span className="muted" style={{ fontSize: 12 }}>
                {formatSize(f.sizeBytes)}
              </span>
              {isTeacher ? (
                <button
                  type="button"
                  className="btn"
                  style={{ padding: "2px 8px" }}
                  onClick={() => void remove(f.id)}
                >
                  删除
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {isTeacher ? (
        <form className="grid" style={{ gap: 8, marginTop: 10 }} onSubmit={(e) => void upload(e)}>
          <input
            placeholder="附件标题（可选）"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input ref={fileRef} type="file" />
          {err ? <div className="err">{err}</div> : null}
          <button type="submit" className="btn" disabled={busy}>
            {busy ? "上传中…" : "上传附件"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
