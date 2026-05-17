import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { api } from "../../api/client";
import type { MaterialRow, MaterialVersionRow, MaterialsListResponse } from "./types";
import {
  FILE_TYPE_OPTIONS,
  VISIBILITY_LABEL,
  childFolders,
  formatBytes,
  formatDate,
  highlightText,
} from "./utils";

type Props = {
  courseId: string;
  isTeacher: boolean;
  onError?: (msg: string | null) => void;
};

export default function MaterialsPanel({ courseId, isTeacher, onError }: Props) {
  const [data, setData] = useState<MaterialsListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [folder, setFolder] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [fileType, setFileType] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [saveOk, setSaveOk] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const [uploadForm, setUploadForm] = useState({
    title: "",
    visibility: "ALL" as "ALL" | "CLASS" | "TEACHER_ONLY",
    targetClassId: "",
    pinned: false,
    notify: true,
    replaceGroupId: "",
  });

  const [editRow, setEditRow] = useState<MaterialRow | null>(null);
  const [editForm, setEditForm] = useState({
    title: "",
    folderPath: "",
    visibility: "ALL" as "ALL" | "CLASS" | "TEACHER_ONLY",
    targetClassId: "",
    pinned: false,
    notify: false,
  });

  const [versionGroupId, setVersionGroupId] = useState<string | null>(null);
  const [versions, setVersions] = useState<MaterialVersionRow[]>([]);

  const [preview, setPreview] = useState<{ title: string; url: string; mime: string } | null>(null);

  const load = useCallback(async () => {
    if (!courseId) return;
    setLoading(true);
    onError?.(null);
    try {
      const { data: res } = await api.get<MaterialsListResponse>(`/courses/${courseId}/materials`, {
        params: {
          q: searchQ || undefined,
          fileType: fileType || undefined,
          folder: folder || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          favorites: favoritesOnly ? "1" : undefined,
        },
      });
      setData(res);
      setSelected(new Set());
    } catch {
      onError?.("无法加载课程资料");
    } finally {
      setLoading(false);
    }
  }, [courseId, searchQ, fileType, folder, dateFrom, dateTo, favoritesOnly, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const subFolders = useMemo(
    () => (data ? childFolders(data.folders, folder) : []),
    [data, folder],
  );

  const breadcrumb = useMemo(() => {
    if (!folder) return [];
    return folder.split("/");
  }, [folder]);

  async function downloadOne(m: MaterialRow) {
    const res = await api.get(`/courses/${courseId}/materials/${m.id}/download`, {
      responseType: "blob",
    });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = m.fileName;
    a.click();
    URL.revokeObjectURL(url);
    void load();
  }

  async function batchDownload() {
    if (selected.size === 0) return;
    const res = await api.post(
      `/courses/${courseId}/materials/batch-download`,
      { ids: [...selected] },
      { responseType: "blob" },
    );
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = "课程资料.zip";
    a.click();
    URL.revokeObjectURL(url);
    void load();
  }

  async function openPreview(m: MaterialRow) {
    const res = await api.get(`/courses/${courseId}/materials/${m.id}/preview`, {
      responseType: "blob",
    });
    const url = URL.createObjectURL(res.data);
    setPreview({ title: m.title, url, mime: m.mimeType ?? "text/plain" });
  }

  function closePreview() {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
  }

  async function toggleFavorite(m: MaterialRow) {
    if (m.favorited) {
      await api.delete(`/courses/${courseId}/materials/${m.id}/favorite`);
    } else {
      await api.post(`/courses/${courseId}/materials/${m.id}/favorite`);
    }
    void load();
  }

  async function uploadFiles(files: FileList | File[]) {
    const list = [...files];
    if (list.length === 0) return;
    setUploading(true);
    onError?.(null);
    const fd = new FormData();
    for (const f of list) fd.append("file", f);
    if (uploadForm.title.trim()) fd.append("title", uploadForm.title.trim());
    fd.append("folderPath", folder);
    fd.append("visibility", uploadForm.visibility);
    if (uploadForm.visibility === "CLASS" && uploadForm.targetClassId) {
      fd.append("targetClassId", uploadForm.targetClassId);
    }
    fd.append("pinned", uploadForm.pinned ? "true" : "false");
    fd.append("notify", uploadForm.notify ? "1" : "0");
    if (uploadForm.replaceGroupId) fd.append("replaceGroupId", uploadForm.replaceGroupId);

    try {
      await api.post(`/courses/${courseId}/materials`, fd);
      setUploadForm((f) => ({ ...f, title: "", replaceGroupId: "" }));
      setSaveOk(true);
      window.setTimeout(() => setSaveOk(false), 2000);
      void load();
    } catch (e: unknown) {
      const msg =
        typeof e === "object" && e !== null && "response" in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : null;
      onError?.(msg ?? "上传失败");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) void uploadFiles(e.target.files);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) void uploadFiles(e.dataTransfer.files);
  }

  async function submitEdit(e: FormEvent) {
    e.preventDefault();
    if (!editRow) return;
    try {
      await api.patch(`/courses/${courseId}/materials/${editRow.id}`, {
        title: editForm.title,
        folderPath: editForm.folderPath,
        visibility: editForm.visibility,
        targetClassId:
          editForm.visibility === "CLASS" ? editForm.targetClassId || null : null,
        pinned: editForm.pinned,
        notify: editForm.notify,
      });
      setEditRow(null);
      void load();
    } catch {
      onError?.("保存失败");
    }
  }

  function openEdit(m: MaterialRow) {
    setEditRow(m);
    setEditForm({
      title: m.title,
      folderPath: m.folderPath,
      visibility: m.visibility,
      targetClassId: m.targetClassId ?? "",
      pinned: m.pinned,
      notify: false,
    });
  }

  async function deleteMaterial(m: MaterialRow) {
    if (!confirm(`确定删除「${m.title}」及其全部版本吗？`)) return;
    await api.delete(`/courses/${courseId}/materials/${m.id}`);
    void load();
  }

  async function openVersions(groupId: string) {
    setVersionGroupId(groupId);
    const { data: v } = await api.get<{ versions: MaterialVersionRow[] }>(
      `/courses/${courseId}/materials/groups/${groupId}/versions`,
    );
    setVersions(v.versions);
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const isManager = data?.isManager ?? isTeacher;
  const materials = data?.materials ?? [];

  return (
    <div className="materials-panel">
      <div className="materials-toolbar card" style={{ padding: 12, marginBottom: 12, boxShadow: "none" }}>
        <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
          <input
            className="dash-select"
            style={{ flex: 1, minWidth: 160 }}
            placeholder="搜索文件名…"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
          />
          <select
            className="dash-select"
            value={fileType}
            onChange={(e) => setFileType(e.target.value)}
          >
            {FILE_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <input
            type="date"
            className="dash-select"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            title="上传起始日期"
          />
          <input
            type="date"
            className="dash-select"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            title="上传截止日期"
          />
          <label className="row muted" style={{ fontSize: 13, gap: 4 }}>
            <input
              type="checkbox"
              checked={favoritesOnly}
              onChange={(e) => setFavoritesOnly(e.target.checked)}
            />
            我的收藏
          </label>
          <button type="button" className="btn" onClick={() => void load()}>
            刷新
          </button>
        </div>
      </div>

      <div className="materials-breadcrumb muted" style={{ fontSize: 13, marginBottom: 8 }}>
        <button type="button" className="link-btn" onClick={() => setFolder("")}>
          根目录
        </button>
        {breadcrumb.map((seg, i) => {
          const path = breadcrumb.slice(0, i + 1).join("/");
          return (
            <span key={path}>
              {" / "}
              <button type="button" className="link-btn" onClick={() => setFolder(path)}>
                {seg}
              </button>
            </span>
          );
        })}
      </div>

      {subFolders.length > 0 ? (
        <div className="materials-folders row" style={{ flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          {subFolders.map((f) => (
            <button key={f} type="button" className="btn" onClick={() => setFolder(f)}>
              📁 {f.split("/").pop()}
            </button>
          ))}
        </div>
      ) : null}

      {isManager ? (
        <div
          className={`materials-dropzone card${dragOver ? " materials-dropzone--active" : ""}`}
          style={{ marginBottom: 12, padding: 16, boxShadow: "none" }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <div className="spread" style={{ marginBottom: 10 }}>
            <strong>上传资料</strong>
            {saveOk ? <span className="save-ok">上传成功</span> : null}
          </div>
          <div className="row" style={{ flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
            <input
              placeholder="标题（多文件时用于首个）"
              value={uploadForm.title}
              onChange={(e) => setUploadForm((f) => ({ ...f, title: e.target.value }))}
              style={{ flex: 1, minWidth: 140 }}
            />
            <select
              className="dash-select"
              value={uploadForm.visibility}
              onChange={(e) =>
                setUploadForm((f) => ({
                  ...f,
                  visibility: e.target.value as typeof f.visibility,
                }))
              }
            >
              <option value="ALL">全班可见</option>
              <option value="CLASS">指定班级</option>
              <option value="TEACHER_ONLY">仅教师</option>
            </select>
            {uploadForm.visibility === "CLASS" ? (
              <select
                className="dash-select"
                value={uploadForm.targetClassId}
                onChange={(e) =>
                  setUploadForm((f) => ({ ...f, targetClassId: e.target.value }))
                }
              >
                <option value="">选择班级</option>
                {(data?.classes ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            ) : null}
            <label className="row muted" style={{ fontSize: 13, gap: 4 }}>
              <input
                type="checkbox"
                checked={uploadForm.pinned}
                onChange={(e) =>
                  setUploadForm((f) => ({ ...f, pinned: e.target.checked }))
                }
              />
              置顶
            </label>
            <label className="row muted" style={{ fontSize: 13, gap: 4 }}>
              <input
                type="checkbox"
                checked={uploadForm.notify}
                onChange={(e) =>
                  setUploadForm((f) => ({ ...f, notify: e.target.checked }))
                }
              />
              通知学生
            </label>
          </div>
          <p className="muted" style={{ margin: "0 0 10px", fontSize: 12 }}>
            当前目录：{folder || "根目录"} · 普通文件 ≤50MB，视频 ≤200MB · 支持批量拖拽
            {uploadForm.replaceGroupId ? " · 正在上传新版本" : ""}
          </p>
          <div className="row" style={{ gap: 8 }}>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden-input"
              id="material-upload-input"
              onChange={onFileInput}
            />
            <label htmlFor="material-upload-input" className="btn primary">
              {uploading ? "上传中…" : "选择文件"}
            </label>
            {uploadForm.replaceGroupId ? (
              <button
                type="button"
                className="btn"
                onClick={() => setUploadForm((f) => ({ ...f, replaceGroupId: "" }))}
              >
                取消新版本
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="spread" style={{ marginBottom: 8 }}>
        <span className="muted" style={{ fontSize: 13 }}>
          {loading ? "加载中…" : `共 ${materials.length} 项`}
        </span>
        {selected.size > 0 ? (
          <button type="button" className="btn primary" onClick={() => void batchDownload()}>
            打包下载（{selected.size}）
          </button>
        ) : null}
      </div>

      {materials.length === 0 && !loading ? (
        <div className="course-section-empty">暂无资料</div>
      ) : (
        <div className="materials-table">
          {materials.map((m) => (
            <div
              key={m.id}
              className={`materials-row${m.pinned ? " materials-row--pinned" : ""}`}
            >
              <input
                type="checkbox"
                checked={selected.has(m.id)}
                onChange={() => toggleSelect(m.id)}
                aria-label={`选择 ${m.title}`}
              />
              <div className="materials-row__main">
                <div className="materials-row__title">
                  {m.pinned ? <span className="badge-warn" style={{ marginRight: 6 }}>置顶</span> : null}
                  {highlightText(m.title, searchQ)}
                  {m.version > 1 ? (
                    <span className="muted" style={{ marginLeft: 6, fontSize: 12 }}>
                      v{m.version}
                    </span>
                  ) : null}
                </div>
                <div className="muted materials-row__meta">
                  {highlightText(m.fileName, searchQ)} · {formatBytes(m.sizeBytes)} ·{" "}
                  {formatDate(m.createdAt)} · {m.uploadedBy.name}
                  {m.folderPath ? ` · ${m.folderPath}` : ""}
                  {isManager ? (
                    <>
                      {" · "}
                      {VISIBILITY_LABEL[m.visibility]}
                      {m.targetClass ? `（${m.targetClass.name}）` : ""}
                      {" · 下载 "}
                      {m.downloadCount}
                      {m.lastDownloadAt
                        ? ` · 最近 ${formatDate(m.lastDownloadAt)}`
                        : ""}
                    </>
                  ) : null}
                </div>
              </div>
              <div className="row materials-row__actions" style={{ gap: 6, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className={`btn icon-btn${m.favorited ? " icon-btn--active" : ""}`}
                  title={m.favorited ? "取消收藏" : "收藏"}
                  onClick={() => void toggleFavorite(m)}
                >
                  {m.favorited ? "★" : "☆"}
                </button>
                {m.previewable ? (
                  <button type="button" className="btn" onClick={() => void openPreview(m)}>
                    预览
                  </button>
                ) : null}
                <button type="button" className="btn" onClick={() => void downloadOne(m)}>
                  下载
                </button>
                {isManager ? (
                  <>
                    <button type="button" className="btn" onClick={() => openEdit(m)}>
                      编辑
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => void openVersions(m.groupId)}
                    >
                      版本
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        setUploadForm((f) => ({
                          ...f,
                          replaceGroupId: m.groupId,
                          title: m.title,
                        }));
                        fileInputRef.current?.click();
                      }}
                    >
                      新版本
                    </button>
                    <button type="button" className="btn" onClick={() => void deleteMaterial(m)}>
                      删除
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {editRow ? (
        <div className="materials-modal-backdrop" onClick={() => setEditRow(null)}>
          <form
            className="card materials-modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={submitEdit}
          >
            <h3 style={{ margin: "0 0 12px" }}>编辑资料</h3>
            <div className="field">
              <label>标题</label>
              <input
                value={editForm.title}
                onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                required
              />
            </div>
            <div className="field">
              <label>目录路径</label>
              <input
                value={editForm.folderPath}
                onChange={(e) => setEditForm((f) => ({ ...f, folderPath: e.target.value }))}
                placeholder="如 第1章/课件"
              />
            </div>
            <div className="field">
              <label>可见范围</label>
              <select
                value={editForm.visibility}
                onChange={(e) =>
                  setEditForm((f) => ({
                    ...f,
                    visibility: e.target.value as typeof f.visibility,
                  }))
                }
              >
                <option value="ALL">全班可见</option>
                <option value="CLASS">指定班级</option>
                <option value="TEACHER_ONLY">仅教师</option>
              </select>
            </div>
            {editForm.visibility === "CLASS" ? (
              <div className="field">
                <label>班级</label>
                <select
                  value={editForm.targetClassId}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, targetClassId: e.target.value }))
                  }
                >
                  <option value="">选择班级</option>
                  {(data?.classes ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <label className="row muted" style={{ fontSize: 13, gap: 4, marginBottom: 8 }}>
              <input
                type="checkbox"
                checked={editForm.pinned}
                onChange={(e) => setEditForm((f) => ({ ...f, pinned: e.target.checked }))}
              />
              置顶
            </label>
            <label className="row muted" style={{ fontSize: 13, gap: 4, marginBottom: 12 }}>
              <input
                type="checkbox"
                checked={editForm.notify}
                onChange={(e) => setEditForm((f) => ({ ...f, notify: e.target.checked }))}
              />
              通知学生资料已更新
            </label>
            <div className="row" style={{ gap: 8 }}>
              <button type="submit" className="btn primary">
                保存
              </button>
              <button type="button" className="btn" onClick={() => setEditRow(null)}>
                取消
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {versionGroupId ? (
        <div className="materials-modal-backdrop" onClick={() => setVersionGroupId(null)}>
          <div
            className="card materials-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 12px" }}>版本历史</h3>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {versions.map((v) => (
                <li key={v.id} style={{ marginBottom: 8 }}>
                  v{v.version} · {v.title} · {formatDate(v.createdAt)}
                  {v.isCurrent ? "（当前）" : ""}
                  <button
                    type="button"
                    className="btn"
                    style={{ marginLeft: 8 }}
                    onClick={() => void downloadOne(v)}
                  >
                    下载
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="btn"
              style={{ marginTop: 12 }}
              onClick={() => setVersionGroupId(null)}
            >
              关闭
            </button>
          </div>
        </div>
      ) : null}

      {preview ? (
        <div className="materials-modal-backdrop" onClick={closePreview}>
          <div
            className="card materials-modal materials-preview"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="spread" style={{ marginBottom: 12 }}>
              <strong>{preview.title}</strong>
              <button type="button" className="btn" onClick={closePreview}>
                关闭
              </button>
            </div>
            {preview.mime.startsWith("image/") ? (
              <img src={preview.url} alt="" style={{ maxWidth: "100%" }} />
            ) : preview.mime.includes("pdf") ? (
              <iframe title="preview" src={preview.url} style={{ width: "100%", height: "70vh", border: 0 }} />
            ) : (
              <iframe title="preview" src={preview.url} style={{ width: "100%", height: "60vh", border: 0 }} />
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
