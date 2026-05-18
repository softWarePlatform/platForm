import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client";
import HomeworkTeacherGradingPanel from "../../components/homework/HomeworkTeacherGradingPanel";

function apiErrorMessage(e: unknown, fallback: string) {
  if (typeof e === "object" && e !== null && "response" in e) {
    return (e as { response?: { data?: { error?: string } } }).response?.data?.error ?? fallback;
  }
  return fallback;
}

export default function HomeworkTeacherReview() {
  const navigate = useNavigate();
  const { homeworkId } = useParams();
  const [meta, setMeta] = useState<{
    id: string;
    title: string;
    description: string | null;
    courseId: string;
    courseTitle: string;
    published: boolean;
    dueAt?: string | null;
  } | null>(null);
  const [redoRequests, setRedoRequests] = useState<any[]>([]);
  const [redoBusy, setRedoBusy] = useState<Record<string, boolean>>({});
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!homeworkId) return;
    setErr(null);
    try {
      const [{ data }, redoRes] = await Promise.all([
        api.get(`/homework/${homeworkId}/submissions`),
        api.get(`/homework/${homeworkId}/redo-requests`),
      ]);
      setMeta(data.homework ?? null);
      setRedoRequests(redoRes.data.requests ?? []);
    } catch {
      setErr("无权查看或作业不存在");
      setMeta(null);
      setRedoRequests([]);
    }
  }, [homeworkId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function exportCsv() {
    if (!homeworkId) return;
    try {
      const res = await api.get(`/homework/${homeworkId}/export-grades.csv`, { responseType: "blob" });
      const blob = res.data as Blob;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = res.headers["content-disposition"] as string | undefined;
      let name = "作业成绩.csv";
      if (cd?.includes("filename*=")) {
        const m = cd.match(/filename\*=UTF-8''(.+)/);
        if (m?.[1]) {
          try {
            name = decodeURIComponent(m[1].replace(/;$/, ""));
          } catch {
            /* ignore */
          }
        }
      }
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setErr("导出失败");
    }
  }

  async function deleteHomework() {
    if (!homeworkId || !meta) return;
    const ok = window.confirm(`确定删除作业「${meta.title}」？此操作不可恢复，所有提交将一并删除。`);
    if (!ok) return;
    setDeleteBusy(true);
    setErr(null);
    try {
      await api.delete(`/homework/${homeworkId}`);
      navigate(`/courses/${meta.courseId}/homework`, { replace: true });
    } catch (e: unknown) {
      setErr(apiErrorMessage(e, "删除失败"));
    } finally {
      setDeleteBusy(false);
    }
  }

  if (err && !meta) {
    return (
      <div className="container">
        <div className="err">{err}</div>
        <Link className="btn" to="/teaching/homework" style={{ display: "inline-block", marginTop: 12 }}>
          返回作业列表
        </Link>
      </div>
    );
  }

  if (!meta) {
    return (
      <div className="container">
        <div className="muted">加载中…</div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="card" style={{ marginTop: 12, boxShadow: "none", padding: 16 }}>
        <div className="row spread" style={{ flexWrap: "wrap", gap: 12, alignItems: "flex-start" }}>
          <div>
            <h2 style={{ margin: 0 }}>{meta.title}</h2>
            <div className="muted" style={{ marginTop: 6 }}>
              {meta.courseTitle} · {meta.published ? "已发布" : "未发布"}
            </div>
            <div className="muted" style={{ marginTop: 4 }}>
              截止：{meta.dueAt ? new Date(meta.dueAt).toLocaleString() : "未设置"}
            </div>
          </div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <button className="btn" type="button" onClick={() => void exportCsv()}>
              导出成绩 CSV
            </button>
            <button
              className="btn primary"
              type="button"
              onClick={async () => {
                await api.patch(`/homework/${homeworkId}/release-grades`, {});
                await load();
              }}
            >
              发布已批改成绩
            </button>
            <button
              className="btn"
              type="button"
              onClick={async () => {
                await api.patch(`/homework/${homeworkId}/publish`, { published: !meta.published });
                await load();
              }}
            >
              {meta.published ? "撤回发布" : "发布作业"}
            </button>
            <button className="btn" type="button" disabled={deleteBusy} onClick={() => void deleteHomework()}>
              {deleteBusy ? "删除中…" : "删除作业"}
            </button>
          </div>
        </div>
        {meta.description ? (
          <div className="muted" style={{ marginTop: 10, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
            {meta.description}
          </div>
        ) : null}
      </div>

      <div className="row" style={{ marginTop: 12, gap: 10, flexWrap: "wrap" }}>
        <Link className="btn" to="/teaching/homework">
          作业批改列表
        </Link>
        <Link className="btn" to={`/courses/${meta.courseId}/homework`}>
          课程内作业
        </Link>
        <button className="btn" type="button" onClick={() => void load()}>
          刷新概览
        </button>
      </div>

      {err ? <div className="err" style={{ marginTop: 12 }}>{err}</div> : null}

      <div className="card" style={{ marginTop: 16, boxShadow: "none", padding: 16 }}>
        <div style={{ fontWeight: 800 }}>重做申请</div>
        <div className="grid" style={{ marginTop: 12 }}>
          {redoRequests.length === 0 ? (
            <div className="muted">暂无重做申请。</div>
          ) : (
            redoRequests.map((r) => (
              <div key={r.id} className="card" style={{ boxShadow: "none" }}>
                <div className="muted" style={{ fontSize: 13 }}>
                  {r.user?.name} · {r.user?.email} · {new Date(r.createdAt).toLocaleString()} · {r.status}
                </div>
                <div style={{ marginTop: 8, whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{r.reason || "（未填写理由）"}</div>
                {r.status === "PENDING" ? (
                  <div className="row" style={{ marginTop: 10, flexWrap: "wrap", gap: 8 }}>
                    <button
                      className="btn primary"
                      type="button"
                      disabled={redoBusy[r.id]}
                      onClick={async () => {
                        setRedoBusy((m) => ({ ...m, [r.id]: true }));
                        setErr(null);
                        try {
                          await api.patch(`/homework/redo-requests/${r.id}`, { action: "approve" });
                          await load();
                        } catch {
                          setErr("通过失败");
                        } finally {
                          setRedoBusy((m) => ({ ...m, [r.id]: false }));
                        }
                      }}
                    >
                      通过重做
                    </button>
                    <button
                      className="btn"
                      type="button"
                      disabled={redoBusy[r.id]}
                      onClick={async () => {
                        const rejectReason = window.prompt("请输入拒绝原因（可选）") ?? "";
                        setRedoBusy((m) => ({ ...m, [r.id]: true }));
                        setErr(null);
                        try {
                          await api.patch(`/homework/redo-requests/${r.id}`, {
                            action: "reject",
                            rejectReason: rejectReason.trim() || undefined,
                          });
                          await load();
                        } catch {
                          setErr("拒绝失败");
                        } finally {
                          setRedoBusy((m) => ({ ...m, [r.id]: false }));
                        }
                      }}
                    >
                      拒绝
                    </button>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>

      <HomeworkTeacherGradingPanel homeworkId={homeworkId!} setErr={setErr} />
    </div>
  );
}
