import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CourseManage() {
  const { courseId } = useParams();
  const [course, setCourse] = useState<any>(null);
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [kgText, setKgText] = useState("");
  const [materials, setMaterials] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [newClassName, setNewClassName] = useState("");
  const [uploadTitle, setUploadTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function reload() {
    if (!courseId) return;
    const [{ data: c }, { data: m }, { data: cl }, { data: st }] = await Promise.all([
      api.get(`/courses/${courseId}`),
      api.get(`/courses/${courseId}/materials`),
      api.get(`/courses/${courseId}/classes`),
      api.get(`/courses/${courseId}/students`),
    ]);
    setCourse(c.course);
    setStartAt(toLocalInput(c.course.startAt));
    setEndAt(toLocalInput(c.course.endAt));
    setKgText(c.course.knowledgeGraphJson ?? "");
    setMaterials(m.materials ?? []);
    setClasses(cl.classes ?? []);
    setStudents(st.students ?? []);
  }

  useEffect(() => {
    reload().catch((e) => setErr(String(e)));
  }, [courseId]);

  async function saveSchedule(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await api.patch(`/courses/${courseId}`, {
        startAt: startAt ? new Date(startAt).toISOString() : null,
        endAt: endAt ? new Date(endAt).toISOString() : null,
      });
      await reload();
    } catch (e2: unknown) {
      const msg =
        typeof e2 === "object" && e2 !== null && "response" in e2
          ? (e2 as { response?: { data?: { error?: string } } }).response?.data?.error
          : null;
      setErr(msg ?? "保存失败");
    }
  }

  async function saveGraphJson() {
    setErr(null);
    try {
      if (kgText.trim()) JSON.parse(kgText);
      await api.patch(`/courses/${courseId}`, { knowledgeGraphJson: kgText.trim() || null });
      await reload();
    } catch {
      setErr("知识图谱需为合法 JSON");
    }
  }

  async function generateGraph(save: boolean) {
    setErr(null);
    try {
      const { data } = await api.post(`/courses/${courseId}/knowledge-graph/generate`, { save });
      setKgText(JSON.stringify(data.graph, null, 2));
      if (save) await reload();
    } catch (e2: unknown) {
      const msg =
        typeof e2 === "object" && e2 !== null && "response" in e2
          ? (e2 as { response?: { data?: { error?: string } } }).response?.data?.error
          : null;
      setErr(msg ?? "生成失败");
    }
  }

  async function uploadMaterial(e: FormEvent) {
    e.preventDefault();
    if (!file || !courseId) return;
    setErr(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("title", uploadTitle || file.name);
    try {
      await api.post(`/courses/${courseId}/materials`, fd);
      setFile(null);
      setUploadTitle("");
      await reload();
    } catch (e2: unknown) {
      const msg =
        typeof e2 === "object" && e2 !== null && "response" in e2
          ? (e2 as { response?: { data?: { error?: string } } }).response?.data?.error
          : null;
      setErr(msg ?? "上传失败");
    }
  }

  async function downloadMaterial(mid: string, fileName: string) {
    const res = await api.get(`/courses/${courseId}/materials/${mid}/download`, {
      responseType: "blob",
    });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!course) {
    return (
      <div className="container">
        <div className="muted">{err ?? "加载中…"}</div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="spread" style={{ marginTop: 12 }}>
        <div>
          <div className="muted">
            <Link to={`/courses/${courseId}`}>← 返回课程</Link>
          </div>
          <h2 style={{ margin: "8px 0 0" }}>课程管理 · {course.title}</h2>
        </div>
      </div>

      {err ? <div className="err" style={{ marginTop: 10 }}>{err}</div> : null}

      <div className="grid" style={{ marginTop: 16, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        <form className="card grid" onSubmit={saveSchedule}>
          <div style={{ fontWeight: 800 }}>时间安排</div>
          <div className="field">
            <label>开课时间</label>
            <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
          </div>
          <div className="field">
            <label>结课时间</label>
            <input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
          </div>
          <button className="btn primary" type="submit">
            保存时间
          </button>
        </form>

        <form className="card grid" onSubmit={uploadMaterial}>
          <div style={{ fontWeight: 800 }}>课程资料 / 讲义</div>
          <div className="field">
            <label>标题（可选）</label>
            <input value={uploadTitle} onChange={(e) => setUploadTitle(e.target.value)} placeholder="默认用文件名" />
          </div>
          <div className="field">
            <label>文件（最大 20MB）</label>
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <button className="btn primary" type="submit" disabled={!file}>
            上传
          </button>
          <div className="grid" style={{ marginTop: 8 }}>
            {materials.map((m) => (
              <div key={m.id} className="row spread" style={{ borderTop: "1px solid var(--border)", paddingTop: 8 }}>
                <span className="muted">
                  {m.title}（{(m.sizeBytes / 1024).toFixed(1)} KB）
                </span>
                <div className="row">
                  <button type="button" className="btn" onClick={() => downloadMaterial(m.id, m.fileName)}>
                    下载
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={async () => {
                      await api.delete(`/courses/${courseId}/materials/${m.id}`);
                      await reload();
                    }}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
            {materials.length === 0 ? <div className="muted">暂无资料</div> : null}
          </div>
        </form>
      </div>

      <div className="card grid" style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 800 }}>知识图谱（JSON）</div>
        <div className="muted" style={{ lineHeight: 1.6 }}>
          点击下方可依据课程简介与实验标题自动生成简易图谱；也可手工编辑 JSON 后保存。
        </div>
        <div className="row">
          <button type="button" className="btn primary" onClick={() => generateGraph(true)}>
            自动生成并保存
          </button>
          <button type="button" className="btn" onClick={() => generateGraph(false)}>
            仅预览不保存
          </button>
        </div>
        <textarea
          rows={12}
          value={kgText}
          onChange={(e) => setKgText(e.target.value)}
          style={{ fontFamily: "monospace", fontSize: 12 }}
        />
        <button className="btn primary" type="button" onClick={() => void saveGraphJson()}>
          保存手动编辑
        </button>
      </div>

      <div className="grid" style={{ marginTop: 16, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        <form
          className="card grid"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newClassName.trim()) return;
            await api.post(`/courses/${courseId}/classes`, { name: newClassName.trim() });
            setNewClassName("");
            await reload();
          }}
        >
          <div style={{ fontWeight: 800 }}>班级</div>
          <div className="field">
            <label>新建班级名称</label>
            <input value={newClassName} onChange={(e) => setNewClassName(e.target.value)} />
          </div>
          <button className="btn primary" type="submit">
            添加班级
          </button>
          <div className="grid" style={{ marginTop: 8 }}>
            {classes.map((c) => (
              <div key={c.id} className="row spread" style={{ borderTop: "1px solid var(--border)", paddingTop: 8 }}>
                <input
                  defaultValue={c.name}
                  onBlur={async (e) => {
                    const name = e.target.value.trim();
                    if (!name || name === c.name) return;
                    await api.patch(`/courses/${courseId}/classes/${c.id}`, { name });
                    await reload();
                  }}
                />
                <button
                  type="button"
                  className="btn"
                  onClick={async () => {
                    if (!confirm("删除班级？学生将变为未分班。")) return;
                    await api.delete(`/courses/${courseId}/classes/${c.id}`);
                    await reload();
                  }}
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        </form>

        <div className="card">
          <div style={{ fontWeight: 800 }}>学生分班</div>
          <div className="muted" style={{ marginTop: 8 }}>
            为每位选课学生指定班级（可选）。
          </div>
          <div className="grid" style={{ marginTop: 12 }}>
            {students.map((s: any) => (
              <div key={s.id} className="row spread" style={{ borderTop: "1px solid var(--border)", paddingTop: 8 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{s.user.name}</div>
                  <div className="muted">{s.user.email}</div>
                </div>
                <select
                  value={s.classId ?? ""}
                  onChange={async (e) => {
                    const classId = e.target.value || null;
                    await api.patch(`/courses/${courseId}/enrollments/${s.id}`, {
                      classId,
                    });
                    await reload();
                  }}
                >
                  <option value="">未分班</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            {students.length === 0 ? <div className="muted">暂无选课学生</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
