import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../api/client";

type AdminLog = {
  id: string;
  action: string;
  actionLabel: string;
  targetType: string;
  targetId: string | null;
  targetLabel: string | null;
  detail: unknown;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  operator: { id: string; name: string; email: string } | null;
};

type LogsResponse = {
  logs: AdminLog[];
  filters: {
    actions: Record<string, string>;
    targetTypes: Record<string, string>;
  };
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    pageCount: number;
  };
};

function getErrorMessage(e: unknown, fallback: string) {
  return typeof e === "object" && e !== null && "response" in e
    ? (e as { response?: { data?: { error?: string } } }).response?.data?.error ?? fallback
    : fallback;
}

function formatDetail(detail: unknown) {
  if (detail === null || detail === undefined) return "无详情";
  if (typeof detail === "string") return detail;
  return JSON.stringify(detail, null, 2);
}

export default function AdminLogs() {
  const [rows, setRows] = useState<AdminLog[]>([]);
  const [actions, setActions] = useState<Record<string, string>>({});
  const [targetTypes, setTargetTypes] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [action, setAction] = useState("");
  const [targetType, setTargetType] = useState("");
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [total, setTotal] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const params = useMemo(
    () => ({
      page,
      pageSize: 30,
      ...(q.trim() ? { q: q.trim() } : {}),
      ...(action ? { action } : {}),
      ...(targetType ? { targetType } : {}),
    }),
    [action, page, q, targetType],
  );

  const load = useCallback(async () => {
    setErr(null);
    const { data } = await api.get<LogsResponse>("/admin/logs", { params });
    setRows(data.logs ?? []);
    setActions(data.filters.actions ?? {});
    setTargetTypes(data.filters.targetTypes ?? {});
    setPageCount(data.pagination.pageCount);
    setTotal(data.pagination.total);
  }, [params]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await load();
      } catch (e) {
        if (!cancelled) setErr(getErrorMessage(e, "无法加载操作日志"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  function applyFilters() {
    setPage(1);
    setLoading(true);
    void load().finally(() => setLoading(false));
  }

  return (
    <>
      <header className="admin-page-header">
        <h1>操作日志</h1>
        <p className="muted" style={{ margin: 0 }}>
          追踪超级管理员的用户、选课配置、课程字段与手动加退课操作
        </p>
      </header>

      {err ? <div className="err" style={{ marginBottom: 12 }}>{err}</div> : null}

      <section className="card admin-section-card" style={{ marginBottom: 14 }}>
        <div className="admin-log-filter-grid">
          <label className="admin-field">
            <span>搜索</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="操作人 / 目标 / 动作"
              onKeyDown={(e) => {
                if (e.key === "Enter") applyFilters();
              }}
            />
          </label>
          <label className="admin-field">
            <span>操作类型</span>
            <select value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}>
              <option value="">全部操作</option>
              {Object.entries(actions).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="admin-field">
            <span>目标类型</span>
            <select value={targetType} onChange={(e) => { setTargetType(e.target.value); setPage(1); }}>
              <option value="">全部目标</option>
              {Object.entries(targetTypes).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <div className="admin-log-filter-actions">
            <button type="button" className="btn primary" onClick={applyFilters}>查询</button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setQ("");
                setAction("");
                setTargetType("");
                setPage(1);
              }}
            >
              重置
            </button>
          </div>
        </div>
      </section>

      <section className="card" style={{ overflow: "auto" }}>
        {loading ? (
          <div className="muted" style={{ padding: 14 }}>加载日志…</div>
        ) : rows.length === 0 ? (
          <div className="muted" style={{ padding: 14 }}>暂无操作日志</div>
        ) : (
          <table className="admin-log-table">
            <thead>
              <tr>
                <th>时间</th>
                <th>操作人</th>
                <th>操作</th>
                <th>目标</th>
                <th>来源</th>
                <th>详情</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((log) => {
                const expanded = expandedId === log.id;
                return (
                  <tr key={log.id}>
                    <td>{new Date(log.createdAt).toLocaleString()}</td>
                    <td>
                      <strong>{log.operator?.name ?? "未知管理员"}</strong>
                      <span>{log.operator?.email ?? "账号已删除"}</span>
                    </td>
                    <td>
                      <span className="admin-log-badge">{log.actionLabel}</span>
                      <span>{log.action}</span>
                    </td>
                    <td>
                      <strong>{log.targetLabel ?? log.targetId ?? "-"}</strong>
                      <span>{targetTypes[log.targetType] ?? log.targetType}</span>
                    </td>
                    <td>
                      <span>{log.ip ?? "-"}</span>
                      <span title={log.userAgent ?? undefined}>{log.userAgent ? "浏览器请求" : "-"}</span>
                    </td>
                    <td>
                      <button type="button" className="btn" onClick={() => setExpandedId(expanded ? null : log.id)}>
                        {expanded ? "收起" : "查看"}
                      </button>
                      {expanded ? <pre className="admin-log-detail">{formatDetail(log.detail)}</pre> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <div className="admin-pagination">
        <span className="muted">共 {total} 条 · 第 {page} / {pageCount} 页</span>
        <button type="button" className="btn" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
          上一页
        </button>
        <button
          type="button"
          className="btn"
          disabled={page >= pageCount}
          onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
        >
          下一页
        </button>
      </div>
    </>
  );
}
