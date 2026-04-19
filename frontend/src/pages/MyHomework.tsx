import { useEffect, useState } from "react";
import { api } from "../api/client";

export default function MyHomework() {
  const [items, setItems] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/homework/mine");
        if (!cancelled) setItems(data.submissions ?? []);
      } catch {
        if (!cancelled) setErr("加载失败");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="container">
      <h2 style={{ marginTop: 10 }}>我的作业</h2>
      {err ? <div className="err">{err}</div> : null}

      <div className="grid" style={{ marginTop: 16 }}>
        {items.map((s) => (
          <div key={s.id} className="card">
            <div style={{ fontWeight: 900 }}>{s.homework.title}</div>
            <div className="muted" style={{ marginTop: 8 }}>
              课程：{s.homework.course.title} · 更新：{new Date(s.updatedAt).toLocaleString()}
            </div>
            <div style={{ marginTop: 12, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{s.content}</div>
            <div className="spread" style={{ marginTop: 12 }}>
              <span className="muted">{s.graded ? `得分：${s.score ?? "-"}` : "待批改"}</span>
              <span className="muted">{s.feedback ? `反馈：${s.feedback}` : ""}</span>
            </div>
          </div>
        ))}
        {items.length === 0 ? <div className="muted">暂无提交记录</div> : null}
      </div>
    </div>
  );
}
