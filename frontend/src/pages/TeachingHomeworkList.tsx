import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";

type Row = {
  id: string;
  title: string;
  courseId: string;
  courseTitle: string;
  dueAt: string | null;
  published: boolean;
  targetClassName: string | null;
  submissionCount: number;
  gradedCount: number;
  releasedCount: number;
};

export default function TeachingHomeworkList() {
  const { user } = useAuth();
  const location = useLocation();
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [legacyBackend, setLegacyBackend] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setErr(null);
      setLegacyBackend(false);
      try {
        const { data } = await api.get("/courses/mine");
        const d = data as {
          courses?: Array<{ _count?: { homeworks?: number } }>;
          teachingHomework?: { homework?: Row[] };
          homework?: Row[];
        };
        let hw = d.teachingHomework?.homework ?? d.homework ?? [];
        hw = Array.isArray(hw) ? hw : [];

        const homeworkCountFromCourses = (d.courses ?? []).reduce(
          (n, c) => n + (c._count?.homeworks ?? 0),
          0,
        );
        const tryTeachingEndpoint =
          hw.length === 0 &&
          (homeworkCountFromCourses > 0 || d.teachingHomework === undefined);
        if (tryTeachingEndpoint) {
          try {
            const { data: alt } = await api.get("/homework/teaching");
            const h2 = alt?.homework;
            if (Array.isArray(h2) && h2.length > 0) {
              hw = h2;
            }
          } catch {
            /* 忽略备用接口错误 */
          }
        }

        if (!cancelled) {
          setRows(hw);
          setLegacyBackend(
            d.teachingHomework === undefined && Array.isArray(d.courses) && d.courses.length > 0,
          );
        }
      } catch (e: unknown) {
        const ax = e as { response?: { status?: number; data?: { error?: string } }; message?: string };
        const status = ax.response?.status;
        const serverMsg = ax.response?.data?.error;
        let hint: string;
        if (status === 401) hint = "未登录或登录已过期，请重新登录";
        else if (status === 403) hint = "当前账号不是教师或管理员";
        else if (status === 404 || /not\s*found/i.test(String(serverMsg ?? ""))) {
          hint =
            "接口返回 404（Not Found）。请完全退出并重新运行根目录 npm run dev；浏览器请使用 http://localhost:5173，并确认 Vite 把 /api 代理到本机 3000 端口后端。";
        } else if (serverMsg) hint = serverMsg;
        else hint = ax.message ?? "网络错误";
        if (!cancelled) setErr(`加载失败：${hint}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [location.key, refreshKey]);

  const listIntro =
    user?.role === "ADMIN"
      ? "以下为系统中全部课程下的作业（管理员视图）。教师账号仅能看到自己授课的课程。"
      : "以下为您作为授课教师名下的课程中的作业。布置作业后若未显示，请先点「刷新列表」。作业须保存在对应课程下才会出现在此表。";

  return (
    <div className="container">
      <div className="spread" style={{ marginTop: 10, alignItems: "flex-start" }}>
        <div>
          <h2 style={{ margin: 0 }}>作业测评</h2>
          <div className="muted" style={{ marginTop: 8, lineHeight: 1.6 }}>
            {listIntro}
          </div>
        </div>
        <div className="row">
          <button type="button" className="btn primary" onClick={() => setRefreshKey((k) => k + 1)}>
            刷新列表
          </button>
          <Link className="btn" to="/teaching">
            教学台
          </Link>
        </div>
      </div>

      {err ? <div className="err" style={{ marginTop: 12 }}>{err}</div> : null}
      {legacyBackend ? (
        <div className="muted" style={{ marginTop: 12, padding: 12, background: "#fff7ed", borderRadius: 12 }}>
          当前后端响应里没有作业测评字段，列表可能为空。请保存代码后<strong>重启</strong>根目录{" "}
          <code>npm run dev</code>，再刷新本页。
        </div>
      ) : null}

      <div className="card" style={{ marginTop: 16, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid var(--border)" }}>课程</th>
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid var(--border)" }}>作业</th>
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid var(--border)" }}>截止</th>
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid var(--border)" }}>状态</th>
              <th style={{ textAlign: "right", padding: 10, borderBottom: "1px solid var(--border)" }}>提交/批改/已发布</th>
              <th style={{ textAlign: "right", padding: 10, borderBottom: "1px solid var(--border)" }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={{ padding: 10, borderBottom: "1px solid var(--border)", verticalAlign: "top" }}>
                  <div style={{ fontWeight: 700 }}>{r.courseTitle}</div>
                  <Link className="muted" style={{ fontSize: 12 }} to={`/courses/${r.courseId}`}>
                    进入课程
                  </Link>
                </td>
                <td style={{ padding: 10, borderBottom: "1px solid var(--border)", verticalAlign: "top" }}>
                  <div style={{ fontWeight: 700 }}>{r.title}</div>
                  {r.targetClassName ? (
                    <div className="muted" style={{ fontSize: 12 }}>
                      面向班级：{r.targetClassName}
                    </div>
                  ) : null}
                </td>
                <td className="muted" style={{ padding: 10, borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>
                  {r.dueAt ? new Date(r.dueAt).toLocaleString() : "—"}
                </td>
                <td style={{ padding: 10, borderBottom: "1px solid var(--border)" }}>
                  <span className="muted">{r.published ? "已发布" : "未发布"}</span>
                </td>
                <td
                  className="muted"
                  style={{ padding: 10, borderBottom: "1px solid var(--border)", textAlign: "right", whiteSpace: "nowrap" }}
                >
                  {r.submissionCount} / {r.gradedCount} / {r.releasedCount}
                </td>
                <td style={{ padding: 10, borderBottom: "1px solid var(--border)", textAlign: "right" }}>
                  <Link className="btn primary" to={`/teaching/homework/${r.id}`}>
                    批改与导出
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && !err ? (
          <div className="muted" style={{ padding: 16 }}>
            暂无作业。请确认：① 使用<strong>创建该课程的同一账号</strong>登录（教师只能看到自己教的课）；② 在课程详情里已成功创建作业；③ 点击右上角「刷新列表」。
          </div>
        ) : null}
      </div>
    </div>
  );
}
