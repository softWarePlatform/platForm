import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getApiError } from "../../api/errors";
import { api } from "../../api/client";
import { useConfirm } from "../../components/ui/ConfirmDialog";
import { useToast } from "../../components/ui/Toast";
import HomeworkTeacherGradingPanel from "../../components/homework/HomeworkTeacherGradingPanel";
import EmptyState from "../../components/layout/EmptyState";
import PageHeader from "../../components/layout/PageHeader";
import PageShell from "../../components/layout/PageShell";
import StatusBadge from "../../components/layout/StatusBadge";
import TeachingSubnav from "../../components/layout/TeachingSubnav";

export default function HomeworkTeacherReview() {
  const navigate = useNavigate();
  const { confirm } = useConfirm();
  const { success: toastSuccess } = useToast();
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
    const ok = await confirm({
      title: "删除作业",
      message: `确定删除作业「${meta.title}」？此操作不可恢复。`,
      confirmLabel: "删除",
      danger: true,
    });
    if (!ok) return;
    setDeleteBusy(true);
    setErr(null);
    try {
      await api.delete(`/homework/${homeworkId}`);
      toastSuccess("已删除作业");
      navigate(`/courses/${meta.courseId}/homework`, { replace: true });
    } catch (e: unknown) {
      setErr(getApiError(e, "删除失败"));
    } finally {
      setDeleteBusy(false);
    }
  }

  if (err && !meta) {
    return (
      <PageShell narrow>
        <div className="page-alert err">{err}</div>
        <Link className="btn" to="/teaching/homework">
          返回作业列表
        </Link>
      </PageShell>
    );
  }

  if (!meta) {
    return (
      <PageShell narrow>
        <div className="panel-loading muted">加载中…</div>
      </PageShell>
    );
  }

  const leadParts = [
    meta.courseTitle,
    meta.dueAt ? `截止 ${new Date(meta.dueAt).toLocaleDateString()}` : "无截止",
  ];

  return (
    <PageShell>
      <PageHeader
        title={meta.title}
        lead={leadParts.join(" · ")}
        actions={
          <>
            <button className="btn" type="button" onClick={() => void exportCsv()}>
              导出 CSV
            </button>
            <button
              className="btn primary"
              type="button"
              onClick={async () => {
                await api.patch(`/homework/${homeworkId}/release-grades`, {});
                await load();
              }}
            >
              发布成绩
            </button>
            <button
              className="btn"
              type="button"
              onClick={async () => {
                await api.patch(`/homework/${homeworkId}/publish`, { published: !meta.published });
                await load();
              }}
            >
              {meta.published ? "撤回" : "发布"}
            </button>
            <button
              className="btn btn--danger"
              type="button"
              disabled={deleteBusy}
              onClick={() => void deleteHomework()}
            >
              {deleteBusy ? "删除中…" : "删除"}
            </button>
          </>
        }
        below={
          <>
            <TeachingSubnav />
            <div className="page-header__meta">
              <StatusBadge tone={meta.published ? "ok" : "muted"}>
                {meta.published ? "已发布" : "草稿"}
              </StatusBadge>
              <Link className="btn btn--sm" to={`/courses/${meta.courseId}/homework`}>
                课程作业
              </Link>
              <button className="btn btn--sm" type="button" onClick={() => void load()}>
                刷新
              </button>
            </div>
          </>
        }
      />

      {err ? <div className="page-alert err">{err}</div> : null}

      {meta.description ? (
        <section className="panel panel--compact" style={{ marginBottom: 16 }}>
          <div className="panel__body panel__body--prose">{meta.description}</div>
        </section>
      ) : null}

      <section className="panel panel--accent" style={{ marginBottom: 16 }}>
        <div className="panel__head panel__head--spread">
          <h2 className="panel__title">重做申请</h2>
          <span className="panel__count">{redoRequests.length} 条</span>
        </div>
        <div className="panel__body">
          {redoRequests.length === 0 ? (
            <EmptyState title="暂无申请" />
          ) : (
            <div className="redo-list">
              {redoRequests.map((r) => (
                <article key={r.id} className="redo-card">
                  <div className="redo-card__head">
                    <strong>{r.user?.name}</strong>
                    <span className="muted">{r.user?.email}</span>
                    <StatusBadge tone={r.status === "PENDING" ? "warn" : "muted"}>{r.status}</StatusBadge>
                  </div>
                  <p className="redo-card__body">{r.reason || "（未填写理由）"}</p>
                  {r.status === "PENDING" ? (
                    <div className="redo-card__actions">
                      <button
                        className="btn primary btn--sm"
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
                        通过
                      </button>
                      <button
                        className="btn btn--sm"
                        type="button"
                        disabled={redoBusy[r.id]}
                        onClick={async () => {
                          const rejectReason = window.prompt("拒绝原因（可选）") ?? "";
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
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <HomeworkTeacherGradingPanel homeworkId={homeworkId!} setErr={setErr} />
    </PageShell>
  );
}
