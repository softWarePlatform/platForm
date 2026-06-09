import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getApiError } from "../api/errors";
import { api } from "../api/client";
import { useConfirm } from "../components/ui/ConfirmDialog";
import { useToast } from "../components/ui/Toast";
import LabProblemCreateModal from "../components/LabProblemCreateModal";
import LabSetStudentSubmissionsModal from "../components/labs/LabSetStudentSubmissionsModal";
import LabSetDiscussionPanel from "../components/labs/LabSetDiscussionPanel";
import LabSetTitleInlineEdit from "../components/labs/LabSetTitleInlineEdit";
import LabSetTimeBanner from "../features/labs/LabSetTimeBanner";

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
  const { confirm } = useConfirm();
  const { success } = useToast();
  const { courseId, labSetId } = useParams();
  const navigate = useNavigate();
  const [labSet, setLabSet] = useState<any>(null);
  const [startLocal, setStartLocal] = useState("");
  const [dueLocal, setDueLocal] = useState("");
  const [allowMakeup, setAllowMakeup] = useState(false);
  const [makeupDueLocal, setMakeupDueLocal] = useState("");
  const [outsideAccessMode, setOutsideAccessMode] = useState<"BLOCK" | "VIEW_ONLY">("BLOCK");
  const [err, setErr] = useState<string | null>(null);
  const [statsErr, setStatsErr] = useState<string | null>(null);
  const [stats, setStats] = useState<LabSetStatsDto | null>(null);
  const [progress, setProgress] = useState<StudentsProgressDto | null>(null);
  const [savingTime, setSavingTime] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editLabId, setEditLabId] = useState<string | null>(null);
  const [judgeMode, setJudgeMode] = useState<"AUTO" | "MANUAL">("AUTO");
  const [allowedLangs, setAllowedLangs] = useState<string[]>(["python", "javascript"]);
  const [extInput, setExtInput] = useState(".py, .js, .java, .cpp, .c");
  const [maxReturnCount, setMaxReturnCount] = useState<string>("");
  const [studentSort, setStudentSort] = useState<"name" | "score">("name");
  const [savingJudge, setSavingJudge] = useState(false);
  const [studentModal, setStudentModal] = useState<{
    userId: string;
    name: string;
  } | null>(null);

  const syncTimeForm = useCallback((detail: any) => {
    setStartLocal(toLocalDatetimeValue(detail?.startAt));
    setDueLocal(toLocalDatetimeValue(detail?.dueAt));
    setAllowMakeup(Boolean(detail?.allowMakeup));
    setMakeupDueLocal(toLocalDatetimeValue(detail?.makeupDueAt));
    setOutsideAccessMode(detail?.outsideAccessMode === "VIEW_ONLY" ? "VIEW_ONLY" : "BLOCK");
    setJudgeMode(detail?.judgeMode === "MANUAL" ? "MANUAL" : "AUTO");
    setMaxReturnCount(
      detail?.maxReturnCount != null && detail.maxReturnCount !== ""
        ? String(detail.maxReturnCount)
        : "",
    );
    setAllowedLangs(
      Array.isArray(detail?.allowedLanguages) && detail.allowedLanguages.length > 0
        ? detail.allowedLanguages
        : ["python", "javascript"],
    );
    setExtInput(
      Array.isArray(detail?.allowedFileExtensions) && detail.allowedFileExtensions.length > 0
        ? detail.allowedFileExtensions.join(", ")
        : ".py, .js, .java, .cpp, .c",
    );
  }, []);

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
      syncTimeForm(detail);
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
  }, [courseId, labSetId, syncTimeForm]);

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
          <div className="muted" style={{ fontSize: 14, marginTop: 8 }}>
            实验集管理
          </div>
          <LabSetTitleInlineEdit
            courseId={courseId!}
            labSetId={labSetId!}
            title={labSet.title}
            onRenamed={(newTitle) => setLabSet((prev: any) => ({ ...prev, title: newTitle }))}
            onError={setErr}
          />
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
              const okDel = await confirm({
                title: "删除实验集",
                message: `确定删除实验集「${labSet.title}」？${extra}`,
                confirmLabel: "删除",
                danger: true,
              });
              if (!okDel) return;
              setErr(null);
              try {
                await api.delete(`/courses/${courseId}/lab-sets/${labSetId}`, {
                  params: n > 0 ? { force: 1 } : {},
                });
                success("已删除实验集");
                navigate(`/courses/${courseId}`);
              } catch (e2: unknown) {
                setErr(getApiError(e2, "删除失败"));
              }
            }}
          >
            删除实验集
          </button>
        </div>
      </div>

      {err ? <div className="err" style={{ marginTop: 10 }}>{err}</div> : null}
      {statsErr ? <div className="err" style={{ marginTop: 10 }}>{statsErr}</div> : null}

      {labSet.access ? <LabSetTimeBanner labSet={labSet} showAccessMode /> : null}

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
                <span style={{ fontWeight: 700 }}>计时起点</span>：{" "}
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
        <div className="row spread" style={{ flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <div style={{ fontWeight: 900 }}>学生完成情况 / 罚时</div>
          <label className="row" style={{ gap: 6, fontSize: 13 }}>
            排序
            <select value={studentSort} onChange={(e) => setStudentSort(e.target.value as "name" | "score")}>
              <option value="name">按姓名</option>
              <option value="score">按平均分</option>
            </select>
          </label>
        </div>
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
                {[...progress.students]
                  .sort((a, b) => {
                    if (studentSort !== "score") {
                      return (a.user.name ?? "").localeCompare(b.user.name ?? "");
                    }
                    const avg = (s: typeof a) => {
                      const scores = s.labs.map((x) => x.bestScore).filter((x) => x != null) as number[];
                      return scores.length ? scores.reduce((p, c) => p + c, 0) / scores.length : -1;
                    };
                    return avg(b) - avg(a);
                  })
                  .map((s) => {
                  const byLab = new Map(s.labs.map((x) => [x.labId, x]));
                  return (
                    <tr key={s.user.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "8px 6px", whiteSpace: "nowrap" }}>
                        <button
                          type="button"
                          className="btn"
                          style={{
                            textAlign: "left",
                            padding: "4px 8px",
                            border: "none",
                            background: "transparent",
                            fontWeight: 600,
                          }}
                          onClick={() =>
                            setStudentModal({
                              userId: s.user.id,
                              name: s.user.name || s.user.email || "学生",
                            })
                          }
                        >
                          {s.user.name || "（未命名）"}
                        </button>
                        <div className="muted" style={{ fontSize: 12 }}>
                          {s.user.email || s.user.id.slice(0, 8)}
                        </div>
                      </td>
                      <td style={{ padding: "8px 6px" }}>{s.allSolved ? "是" : "否"}</td>
                      <td style={{ padding: "8px 6px" }}>{s.totalPenaltyMinutes}</td>
                      <td style={{ padding: "8px 6px", whiteSpace: "nowrap" }}>
                        {formatShortDateTime(s.lastSubmitAt)}
                      </td>
                      {(labSet.labs as { id: string; title: string }[]).map((l) => {
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
        <div style={{ fontWeight: 900 }}>实验时间设置</div>
        <form
          className="grid"
          style={{ marginTop: 12, gap: 12, maxWidth: 520 }}
          onSubmit={async (e) => {
            e.preventDefault();
            setSavingTime(true);
            setErr(null);
            try {
              const newDue = dueLocal ? new Date(dueLocal) : null;
              const oldDue = labSet?.dueAt ? new Date(labSet.dueAt) : null;
              if (
                newDue &&
                oldDue &&
                !Number.isNaN(newDue.getTime()) &&
                !Number.isNaN(oldDue.getTime()) &&
                newDue.getTime() < oldDue.getTime()
              ) {
                const okEarly = await confirm({
                  title: "提前截止时间",
                  message: "你将提前实验截止时间，可能影响学生提交计划。确定继续？",
                });
                if (!okEarly) {
                  setSavingTime(false);
                  return;
                }
              }
              await api.patch(`/courses/${courseId}/lab-sets/${labSetId}`, {
                startAt: startLocal ? new Date(startLocal).toISOString() : null,
                dueAt: dueLocal ? new Date(dueLocal).toISOString() : null,
                allowMakeup,
                makeupDueAt:
                  allowMakeup && makeupDueLocal ? new Date(makeupDueLocal).toISOString() : null,
                outsideAccessMode,
              });
              await load();
            } catch (e2: unknown) {
              const msg =
                typeof e2 === "object" && e2 !== null && "response" in e2
                  ? (e2 as { response?: { data?: { error?: string } } }).response?.data?.error
                  : null;
              setErr(msg ?? "保存失败");
            } finally {
              setSavingTime(false);
            }
          }}
        >
          <div className="field" style={{ margin: 0 }}>
            <label>开始时间</label>
            <input
              type="datetime-local"
              value={startLocal}
              onChange={(e) => setStartLocal(e.target.value)}
            />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>截止时间</label>
            <input type="datetime-local" value={dueLocal} onChange={(e) => setDueLocal(e.target.value)} />
          </div>
          <label className="row" style={{ gap: 8, alignItems: "center", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={allowMakeup}
              onChange={(e) => setAllowMakeup(e.target.checked)}
            />
            开放补交
          </label>
          {allowMakeup ? (
            <div className="field" style={{ margin: 0 }}>
              <label>补交截止时间</label>
              <input
                type="datetime-local"
                value={makeupDueLocal}
                onChange={(e) => setMakeupDueLocal(e.target.value)}
              />
            </div>
          ) : null}
          <div className="field" style={{ margin: 0 }}>
            <label>窗口外访问（未开始 / 已截止且非补交时）</label>
            <select
              value={outsideAccessMode}
              onChange={(e) => setOutsideAccessMode(e.target.value as "BLOCK" | "VIEW_ONLY")}
            >
              <option value="BLOCK">不可进入（阻断）</option>
              <option value="VIEW_ONLY">可查看题面，不可提交</option>
            </select>
          </div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <button
              className="btn"
              type="button"
              onClick={() => {
                setStartLocal("");
                setDueLocal("");
                setAllowMakeup(false);
                setMakeupDueLocal("");
              }}
            >
              清空时间
            </button>
            <button className="btn primary" type="submit" disabled={savingTime}>
              {savingTime ? "保存中…" : "保存时间设置"}
            </button>
          </div>
        </form>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div style={{ fontWeight: 900 }}>提交与批改设置</div>
        <form
          className="grid"
          style={{ marginTop: 12, gap: 12, maxWidth: 520 }}
          onSubmit={async (e) => {
            e.preventDefault();
            setSavingJudge(true);
            setErr(null);
            try {
              const exts = extInput
                .split(/[,，\s]+/)
                .map((x) => x.trim())
                .filter(Boolean)
                .map((x) => (x.startsWith(".") ? x : `.${x}`));
              await api.patch(`/courses/${courseId}/lab-sets/${labSetId}`, {
                judgeMode,
                allowedLanguages: allowedLangs,
                allowedFileExtensions: exts,
                maxReturnCount:
                  maxReturnCount.trim() === "" ? null : Number(maxReturnCount.trim()),
              });
              await load();
            } catch (e2: unknown) {
              const msg =
                typeof e2 === "object" && e2 !== null && "response" in e2
                  ? (e2 as { response?: { data?: { error?: string } } }).response?.data?.error
                  : null;
              setErr(msg ?? "保存失败");
            } finally {
              setSavingJudge(false);
            }
          }}
        >
          <div className="field" style={{ margin: 0 }}>
            <label>批改模式</label>
            <select
              value={judgeMode}
              onChange={(e) => setJudgeMode(e.target.value as "AUTO" | "MANUAL")}
            >
              <option value="AUTO">自动评测（评测机）</option>
              <option value="MANUAL">手动批改</option>
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>允许语言（多选）</label>
            <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
              {(["python", "javascript"] as const).map((lang) => (
                <label key={lang} className="row" style={{ gap: 6, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={allowedLangs.includes(lang)}
                    onChange={(e) => {
                      setAllowedLangs((prev) =>
                        e.target.checked ? [...prev, lang] : prev.filter((x) => x !== lang),
                      );
                    }}
                  />
                  {lang}
                </label>
              ))}
            </div>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>允许文件扩展名（逗号分隔）</label>
            <input value={extInput} onChange={(e) => setExtInput(e.target.value)} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>最大打回次数（留空不限制）</label>
            <input
              type="number"
              min={0}
              max={20}
              placeholder="例如 3"
              value={maxReturnCount}
              onChange={(e) => setMaxReturnCount(e.target.value)}
            />
          </div>
          <button className="btn primary" type="submit" disabled={savingJudge}>
            {savingJudge ? "保存中…" : "保存提交设置"}
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
                    const okLab = await confirm({
                      title: "删除题目",
                      message: `确定删除题目「${l.title}」？将同时删除用例与提交记录。`,
                      danger: true,
                    });
                    if (!okLab) return;
                    setErr(null);
                    try {
                      await api.delete(`/labs/${l.id}`);
                      await load();
                      success("已删除题目");
                    } catch (e2: unknown) {
                      setErr(getApiError(e2, "删除失败"));
                    }
                  }}
                >
                  删除
                </button>
              </div>
            </div>
          ))}
          {labSet.labs.length === 0 ? <div className="muted">暂无题目</div> : null}
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

      {studentModal ? (
        <LabSetStudentSubmissionsModal
          open
          courseId={courseId!}
          labSetId={labSetId!}
          userId={studentModal.userId}
          studentName={studentModal.name}
          onClose={() => setStudentModal(null)}
        />
      ) : null}

      <div className="card" style={{ marginTop: 14 }}>
        <div style={{ fontWeight: 900 }}>实验集讨论</div>
        <div style={{ marginTop: 12 }}>
          <LabSetDiscussionPanel courseId={courseId!} labSetId={labSetId!} />
        </div>
      </div>
    </div>
  );
}
