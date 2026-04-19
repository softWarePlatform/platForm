import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";

export default function Teaching() {
  const [courses, setCourses] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("程序设计");
  const [published, setPublished] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function reload() {
    const { data } = await api.get("/courses/mine");
    setCourses(data.courses);
  }

  useEffect(() => {
    reload().catch(() => setErr("加载失败"));
  }, []);

  async function createCourse(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await api.post("/courses", { title, description, category, published });
      setTitle("");
      setDescription("");
      await reload();
    } catch (e2: unknown) {
      const msg =
        typeof e2 === "object" && e2 !== null && "response" in e2
          ? (e2 as { response?: { data?: { error?: string } } }).response?.data?.error
          : null;
      setErr(msg ?? "创建失败");
    }
  }

  return (
    <div className="container">
      <h2 style={{ marginTop: 10 }}>教学台</h2>
      <div className="muted" style={{ marginTop: 8 }}>
        创建课程、发布内容；实验测试用例请在课程详情进入实验后由教师接口创建（也可直接用 API 调试）。
      </div>

      <div className="grid" style={{ marginTop: 16, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        <form className="card grid" onSubmit={createCourse}>
          <div style={{ fontWeight: 900 }}>新建课程</div>
          <div className="field">
            <label>标题</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="field">
            <label>分类</label>
            <input value={category} onChange={(e) => setCategory(e.target.value)} />
          </div>
          <div className="field">
            <label>简介</label>
            <textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <label className="row">
            <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
            <span className="muted">发布后对学生可见</span>
          </label>
          {err ? <div className="err">{err}</div> : null}
          <button className="btn primary" type="submit">
            创建
          </button>
        </form>

        <div className="card">
          <div style={{ fontWeight: 900 }}>我的课程</div>
          <div className="grid" style={{ marginTop: 12 }}>
            {courses.map((c) => (
              <div key={c.id} className="row spread" style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                <div>
                  <div style={{ fontWeight: 850 }}>{c.title}</div>
                  <div className="muted">
                    {c.published ? "已发布" : "未发布"} · 选课 {c._count?.enrollments ?? 0} · 实验 {c._count?.labs ?? 0}{" "}
                    · 作业 {c._count?.homeworks ?? 0}
                  </div>
                </div>
                <Link className="btn" to={`/courses/${c.id}`}>
                  打开
                </Link>
              </div>
            ))}
            {courses.length === 0 ? <div className="muted">暂无课程</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
