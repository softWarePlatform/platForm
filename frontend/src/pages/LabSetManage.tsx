import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import LabProblemCreateModal from "../components/LabProblemCreateModal";

function toLocalDatetimeValue(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function formatShortDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

type PenaltyRuleDto = {
  startAt: string;
  source: string;
  wrongSubmissionPenaltyMinutes: number;
  formula: string;
};

type LabSetStatsDto = {
  penaltyRule: PenaltyRuleDto;
  problemCount: number;
  enrolledStudentCount: number;
  fullySolvedStudentCount: number;
  completionRate: number | null;
  problems: Array<{
    labId: string;
    title: string;
    submissionCount: number;
    distinctStudentCount: number;
    acceptedStudentCount: number;
  }>;
};

type UserLabProgressDto = {
  labId: string;
  title: string;
  solved: boolean;
  bestScore: number | null;
  lastStatus: string;
  lastSubmitAt: string | null;
  wrongBeforeFirstAc: number;
  firstAcAt: string | null;
  problemPenaltyMinutes: number;
};

type StudentsProgressDto = {
  penaltyRule: PenaltyRuleDto;
  students: Array<{
    user: { id: string; name: string | null; email: string | null };
    allSolved: boolean;
    totalPenaltyMinutes: number;
    lastSubmitAt: string | null;
    labs: UserLabProgressDto[];
  }>;
};

export default function LabSetManage() {
  const { courseId, labSetId } = useParams();
  const navigate = useNavigate();
  const [labSet, setLabSet] = useState<any>(null);
  const [dueLocal, setDueLocal] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [statsErr, setStatsErr] = useState<string | null>(null);
  const [stats, setStats] = useState<LabSetStatsDto | null>(null);
  const [progress, setProgress] = useState<StudentsProgressDto | null>(null);
  const [savingDue, setSavingDue] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editLabId, setEditLabId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    setStatsErr(null);
    setStats(null);
    setProgress(null);
    let detail: any;
    try {
      const { data } = await api.get(`/courses/${courseId}/lab-sets/${labSetId}`);
      detail = data.labSet;
      setLabSet(detail);
      setDueLocal(toLocalDatetimeValue(detail?.dueAt));
    } catch {
      setErr("无法加载（仅本课教师或管理员）");
      return;
    }
    try {
      const [st, pr] = await Promise.all([
        api.get<LabSetStatsDto>(`/courses/${courseId}/lab-sets/${labSetId}/stats`),
        api.get<StudentsProgressDto>(`/courses/${courseId}/lab-sets/${labSetId}/students-progress`),
      ]);
      setStats(st.data);
      setProgress(pr.data);
    } catch {
      setStatsErr("汇总统计或学生进度加载失败（需教师/管理员权限）");
    }
  }, [courseId, labSetId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!labSet && !err) {
    return (
      <div className="container">
        <div className="muted">加载中…</div>
      </div>
    );
  }

  if (err && !labSet) {
    return (
      <div className="container">
        <div className="err">{err}</div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="spread" style={{ marginTop: 8, alignItems: "flex-start" }}>
        <div>
          <div className="muted">
            <Link to={`/courses/${courseId}`}>返回课程</Link>
          </div>
          <h2 style={{ margin: "8px 0 0" }}>实验集管理 · {labSet.title}</h2>
          <div className="muted" style={{ marginTop: 8 }}>
            题目列表、截止时间；新建/编辑题目（弹窗含 Markdown 预览，已发布题目可改题面）。
          </div>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              setEditLabId(null);
              setModalOpen(true);
            }}
          >
            新建题目
          </button>
          <button
            type="button"
            className="btn"
            style={{ color: "#f85149" }}
            onClick={async () => {
              const n = (labSet.labs as unknown[] | undefined)?.length ?? 0;
              const extra =
                n > 0
                  ? `将删除本集下 ${n} 道题及全部测试用例与学生提交，且不可恢复。`
                  : "将删除本实验集（当前无题目），不可恢复。";
              if (!confirm(`确定删除实验集「${labSet.title}」？${extra}`)) return;
              setErr(null);
              try {
                await api.delete(`/courses/${courseId}/lab-sets/${labSetId}`, {
                  params: n > 0 ? { force: 1 } : {},
                });
                navigate(`/courses/${courseId}`);
              } catch (e2: unknown) {
                const msg =
                  typeof e2 === "object" && e2 !== null && "response" in e2
                    ? (e2 as { response?: { data?: { error?: string } } }).response?.data?.error
                    : null;
                setErr(msg ?? "删除失败");
              }
            }}
          >
            删除实验集
          </button>
        </div>
      </div>

      {err ? <div className="err" style={{ marginTop: 10 }}>{err}</div> : null}
      {statsErr ? <div className="err" style={{ marginTop: 10 }}>{statsErr}</div> : null}

      <div className="card" style={{ marginTop: 14 }}>
        <div style={{ fontWeight: 900 }}>汇总统计 · 罚时规则</div>
        {!stats ? (
          <div className="muted" style={{ marginTop: 10 }}>
            {statsErr ? null : "加载统计中…"}
          </div>
        ) : (
          <>
            <div className="muted" style={{ marginTop: 10, lineHeight: 1.55 }}>
              <div>
                <span style={{ fontWeight: 700 }}>计时起点</span>：实验集创建时间{" "}
                {formatShortDateTime(stats.penaltyRule.startAt)}（{stats.penaltyRule.source}）。
              </div>
              <div style={{ marginTop: 6 }}>
                <span style={{ fontWeight: 700 }}>错误提交罚分</span>：每次 WRONG_ANSWER / ERROR / TIMEOUT 在首次 AC
                之前记 +{stats.penaltyRule.wrongSubmissionPenaltyMinutes} 分钟。
              </div>
              <div style={{ marginTop: 6 }}>{stats.penaltyRule.formula}</div>
            </div>
            <div className="row" style={{ marginTop: 14, flexWrap: "wrap", gap: 16 }}>
              <div>
                <div className="muted">选课人数</div>
                <div style={{ fontWeight: 800, fontSize: 18 }}>{stats.enrolledStudentCount}</div>
              </div>
              <div>
                <div className="muted">题目数</div>
                <div style={{ fontWeight: 800, fontSize: 18 }}>{stats.problemCount}</div>
              </div>
              <div>
                <div className="muted">全做完人数</div>
                <div style={{ fontWeight: 800, fontSize: 18 }}>{stats.fullySolvedStudentCount}</div>
              </div>
              <div>
                <div className="muted">全做完比例</div>
                <div style={{ fontWeight: 800, fontSize: 18 }}>
                  {stats.completionRate == null ? "—" : `${Math.round(stats.completionRate * 100)}%`}
                </div>
              </div>
            </div>
            {stats.problems.length ? (
              <div style={{ marginTop: 14, overflowX: "auto" }}>
                <table className="table" style={{ width: "100%", minWidth: 520, borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                      <th style={{ padding: "8px 6px" }}>题目</th>
                      <th style={{ padding: "8px 6px" }}>提交数</th>
                      <th style={{ padding: "8px 6px" }}>参与人数</th>
                      <th style={{ padding: "8px 6px" }}>通过人数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.problems.map((p) => (
                      <tr key={p.labId} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "8px 6px" }}>{p.title}</td>
                        <td style={{ padding: "8px 6px" }}>{p.submissionCount}</td>
                        <td style={{ padding: "8px 6px" }}>{p.distinctStudentCount}</td>
                        <td style={{ padding: "8px 6px" }}>{p.acceptedStudentCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="muted" style={{ marginTop: 12 }}>
                暂无题目，无按题统计。
              </div>
            )}
          </>
        )}
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div style={{ fontWeight: 900 }}>学生完成情况 / 罚时</div>
        {!progress ? (
          <div className="muted" style={{ marginTop: 10 }}>
            {statsErr ? null : "加载中…"}
          </div>
        ) : progress.students.length === 0 ? (
          <div className="muted" style={{ marginTop: 10 }}>
            暂无选课学生。
          </div>
        ) : (
          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <table
              className="table"
              style={{ width: "max-content", minWidth: "100%", borderCollapse: "collapse", fontSize: 13 }}
            >
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                  <th style={{ padding: "8px 6px", whiteSpace: "nowrap" }}>学生</th>
                  <th style={{ padding: "8px 6px", whiteSpace: "nowrap" }}>全做完</th>
                  <th style={{ padding: "8px 6px", whiteSpace: "nowrap" }}>总罚时(分)</th>
                  <th style={{ padding: "8px 6px", whiteSpace: "nowrap" }}>最后提交</th>
                  {(labSet.labs as { id: string; title: string }[]).map((l) => (
                    <th
                      key={l.id}
                      style={{ padding: "8px 6px", maxWidth: 140, whiteSpace: "normal", fontWeight: 700 }}
                      title={l.title}
                    >
                      {l.title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {progress.students.map((s) => {
                  const byLab = new Map(s.labs.map((x) => [x.labId, x]));
                  return (
                    <tr key={s.user.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "8px 6px", whiteSpace: "nowrap" }}>
                        <div style={{ fontWeight: 600 }}>{s.user.name || "（未命名）"}</div>
                        <div className="muted" style={{ fontSize: 12 }}>
                          {s.user.email || s.user.id.slice(0, 8)}
                        </div>
                      </td>
                      <td style={{ padding: "8px 6px" }}>{s.allSolved ? "是" : "否"}</td>
                      <td style={{ padding: "8px 6px" }}>{s.totalPenaltyMinutes}</td>
                      <td style={{ padding: "8px 6px", whiteSpace: "nowrap" }}>
                        {formatShortDateTime(s.lastSubmitAt)}
                      </td>
                      {(labSet.labs as { id: string }[]).map((l) => {
                        const cell = byLab.get(l.id);
                        if (!cell) return <td key={l.id} style={{ padding: "8px 6px" }}>—</td>;
                        const scorePart =
                          cell.bestScore != null ? `${cell.bestScore}分` : cell.solved ? "AC" : "—";
                        return (
                          <td key={l.id} style={{ padding: "8px 6px", verticalAlign: "top" }}>
                            <div>{cell.solved ? "✓ " : ""}{scorePart}</div>
                            <div className="muted" style={{ fontSize: 11 }}>
                              {cell.solved
                                ? `罚时 ${cell.problemPenaltyMinutes}m`
                                : cell.lastSubmitAt
                                  ? formatShortDateTime(cell.lastSubmitAt)
                                  : cell.lastStatus}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div style={{ fontWeight: 900 }}>实验截止时间</div>
        <div className="muted" style={{ marginTop: 8 }}>
          留空表示不限制；保存后对学生与教师提交均生效。
        </div>
        <form
          className="row"
          style={{ marginTop: 12, flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}
          onSubmit={async (e) => {
            e.preventDefault();
            setSavingDue(true);
            setErr(null);
            try {
              await api.patch(`/courses/${courseId}/lab-sets/${labSetId}`, {
                dueAt: dueLocal ? new Date(dueLocal).toISOString() : null,
              });
              await load();
            } catch (e2: unknown) {
              const msg =
                typeof e2 === "object" && e2 !== null && "response" in e2
                  ? (e2 as { response?: { data?: { error?: string } } }).response?.data?.error
                  : null;
              setErr(msg ?? "保存失败");
            } finally {
              setSavingDue(false);
            }
          }}
        >
          <div className="field" style={{ margin: 0 }}>
            <label>截止时间</label>
            <input
              type="datetime-local"
              value={dueLocal}
              onChange={(e) => setDueLocal(e.target.value)}
            />
          </div>
          <button className="btn" type="button" onClick={() => setDueLocal("")}>
            清空
          </button>
          <button className="btn primary" type="submit" disabled={savingDue}>
            {savingDue ? "保存中…" : "保存截止时间"}
          </button>
        </form>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div style={{ fontWeight: 900 }}>题目列表</div>
        <div className="grid" style={{ marginTop: 12 }}>
          {(labSet.labs as { id: string; title: string; language: string }[]).map((l) => (
            <div
              key={l.id}
              className="row spread"
              style={{ borderTop: "1px solid var(--border)", paddingTop: 12, alignItems: "center" }}
            >
              <div>
                <div style={{ fontWeight: 700 }}>{l.title}</div>
                <div className="muted">{l.language}</div>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <Link className="btn" to={`/courses/${courseId}/labs/${l.id}`}>
                  打开题目页
                </Link>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setEditLabId(l.id);
                    setModalOpen(true);
                  }}
                >
                  编辑题目
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={async () => {
                    if (!confirm(`确定删除题目「${l.title}」？将同时删除用例与提交记录。`)) return;
                    setErr(null);
                    try {
                      await api.delete(`/labs/${l.id}`);
                      await load();
                    } catch (e2: unknown) {
                      const msg =
                        typeof e2 === "object" && e2 !== null && "response" in e2
                          ? (e2 as { response?: { data?: { error?: string } } }).response?.data?.error
                          : null;
                      setErr(msg ?? "删除失败");
                    }
                  }}
                >
                  删除
                </button>
              </div>
            </div>
          ))}
          {labSet.labs.length === 0 ? <div className="muted">暂无题目，点击右上角新建。</div> : null}
        </div>
      </div>

      <LabProblemCreateModal
        open={modalOpen}
        courseId={courseId!}
        labSetId={labSetId!}
        editLabId={editLabId}
        onClose={() => {
          setModalOpen(false);
          setEditLabId(null);
        }}
        onCreated={() => void load()}
      />
    </div>
  );
}
