import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";

type CourseRow = {
  id: string;
  title: string;
  description?: string | null;
  category?: string | null;
  teacher: { id: string; name: string };
  enrollmentCount: number;
};

export default function Courses({ enrollmentMode = false }: { enrollmentMode?: boolean }) {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [items, setItems] = useState<CourseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/courses/categories");
        if (!cancelled) setCategories(data.categories ?? []);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const params: { search?: string; category?: string } = {};
        if (q.trim()) params.search = q.trim();
        if (category) params.category = category;
        const { data } = await api.get("/courses", { params });
        if (!cancelled) setItems(data.courses);
      } catch {
        if (!cancelled) setError("加载失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [q, category]);

  return (
    <div className="container">
      <div className="spread" style={{ marginTop: 8 }}>
        <h2 style={{ margin: 0 }}>{enrollmentMode ? "选课系统" : "课程中心"}</h2>
        <div className="row">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              minWidth: 140,
            }}
          >
            <option value="">全部分类</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            placeholder="搜索课程…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              minWidth: 220,
            }}
          />
        </div>
      </div>
      <div className="muted" style={{ marginTop: 8 }}>
        {enrollmentMode
          ? "选课后将同步到主界面课表与「我的课程」。仅展示已发布课程。"
          : "仅展示已发布课程；教师可在「教学台」管理未发布内容。"}
      </div>

      {error ? <div className="err">{error}</div> : null}
      {loading ? <div className="muted" style={{ marginTop: 16 }}>加载中…</div> : null}

      <div className="grid" style={{ marginTop: 16, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
        {items.map((c) => (
          <Link key={c.id} to={`/courses/${c.id}`} style={{ textDecoration: "none", color: "inherit" }}>
            <div className="card" style={{ height: "100%" }}>
              <div style={{ fontWeight: 900, fontSize: 18 }}>{c.title}</div>
              <div className="muted" style={{ marginTop: 10, lineHeight: 1.6 }}>
                {c.description ? c.description : "暂无简介"}
              </div>
              <div className="spread" style={{ marginTop: 14 }}>
                <span className="muted">{c.category ? `「${c.category}」 · ` : null}教师：{c.teacher.name}</span>
                <span className="muted">选课：{c.enrollmentCount}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {!loading && items.length === 0 ? <div className="muted" style={{ marginTop: 16 }}>暂无课程</div> : null}
    </div>
  );
}
