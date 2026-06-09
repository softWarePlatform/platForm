import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import { useConfirm } from "../components/ui/ConfirmDialog";
import CourseEnrollmentFields, {
  enrollmentFromCourse,
  enrollmentToPayload,
  useEnrollmentFieldOptions,
  type CourseEnrollmentDraft,
} from "../components/CourseEnrollmentFields";
import CourseScheduleFields, { slotsFromCourse, type ScheduleSlotDraft } from "../components/CourseScheduleFields";

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CourseManage() {
  const { confirm } = useConfirm();
  const { courseId } = useParams();
  const [course, setCourse] = useState<any>(null);
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [scheduleSlots, setScheduleSlots] = useState<ScheduleSlotDraft[]>([]);
  const [enrollment, setEnrollment] = useState<CourseEnrollmentDraft | null>(null);
  const enrollmentOptions = useEnrollmentFieldOptions();
  const [, setMaterials] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [newClassName, setNewClassName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const classStats = useMemo(() => {
    const enrolled = students.length;
    const classCount = classes.length;
    const now = Date.now();
    const start = course?.startAt ? new Date(course.startAt).getTime() : null;
    const end = course?.endAt ? new Date(course.endAt).getTime() : null;
    let scheduleState = "未设置";
    if (start != null || end != null) {
      if (start != null && now < start) scheduleState = "未开始";
      else if (end != null && now > end) scheduleState = "已结束";
      else scheduleState = "进行中";
    }
    return [
      { label: "班级数", value: classCount },
      { label: "选课学生", value: enrolled },
      { label: "资料数", value: course?._count?.materials ?? "-" },
      { label: "当前时间安排状态", value: scheduleState },
    ];
  }, [classes.length, students.length, course]);

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
    setScheduleSlots(slotsFromCourse(c.course));
    setEnrollment(enrollmentFromCourse(c.course));
    setMaterials(m.materials ?? []);
    setClasses(cl.classes ?? []);
    setStudents(st.students ?? []);
  }

  useEffect(() => {
    reload().catch((e) => setErr(String(e)));
  }, [courseId]);

  async function saveScheduleAndEnrollment(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setSaveOk(false);
    if (!enrollment) return;
    for (const s of scheduleSlots) {
      if (s.periodEnd < s.periodStart) {
        setErr("结束节次不能早于开始节次");
        return;
      }
    }
    try {
      setBusy("schedule");
      await api.patch(`/courses/${courseId}`, {
        startAt: startAt ? new Date(startAt).toISOString() : null,
        endAt: endAt ? new Date(endAt).toISOString() : null,
        ...enrollmentToPayload(enrollment, { clearEmptyCode: true }),
        scheduleSlots: scheduleSlots.map((s) => ({
          dayOfWeek: s.dayOfWeek,
          periodStart: s.periodStart,
          periodEnd: s.periodEnd,
          room: s.room.trim(),
        })),
      });
      await reload();
      setSaveOk(true);
      window.setTimeout(() => setSaveOk(false), 3000);
    } catch (e2: unknown) {
      const msg =
        typeof e2 === "object" && e2 !== null && "response" in e2
          ? (e2 as { response?: { data?: { error?: string } } }).response?.data?.error
          : null;
      setErr(msg ?? "保存失败");
    } finally {
      setBusy(null);
    }
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
      <div className="card" style={{ marginTop: 12, padding: 18 }}>
        <div className="spread" style={{ alignItems: "flex-start", gap: 16 }}>
          <div>
            <div className="muted" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Link to={`/courses/${courseId}/announcements`}>← 返回课程</Link>
              <Link to="/admin/class">班级目录</Link>
            </div>
            <h2 style={{ margin: "8px 0 6px" }}>课程管理 · {course.title}</h2>
            <div className="muted">统一后台布局 · 班级、时间、资料集中管理</div>
          </div>
          <div className="row" style={{ gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <span className="status-badge status-badge--brand">课程 ID: {course.id.slice(0, 8)}</span>
            <span className="status-badge status-badge--muted">{course.published ? "已发布" : "未发布"}</span>
          </div>
        </div>
      </div>

      {err ? <div className="err" style={{ marginTop: 10 }}>{err}</div> : null}
      {saveOk ? <div className="page-alert page-alert--ok" style={{ marginTop: 10 }}>保存成功，课程配置已立即生效。</div> : null}

      <div className="grid" style={{ marginTop: 16, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        {classStats.map((item) => (
          <article key={item.label} className="card" style={{ padding: 18 }}>
            <div className="muted">{item.label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, marginTop: 8 }}>{item.value as any}</div>
          </article>
        ))}
      </div>

      <div className="grid" style={{ marginTop: 16, gridTemplateColumns: "2fr 1fr" }}>
        <form className="card grid" onSubmit={saveScheduleAndEnrollment} style={{ gap: 14 }}>
          <div className="spread" style={{ alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 800 }}>选课系统 · 时间与地点</div>
              <div className="muted">修改后会立即影响前台课程展示与学生选课可见性</div>
            </div>
            <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
              <button className="btn" type="button" onClick={() => reload().catch(() => undefined)} disabled={busy === "schedule"}>
                重新加载
              </button>
              <button className="btn primary" type="submit" disabled={busy === "schedule"}>
                {busy === "schedule" ? "保存中…" : "保存配置"}
              </button>
            </div>
          </div>

          {enrollment ? <CourseEnrollmentFields value={enrollment} onChange={setEnrollment} options={enrollmentOptions} /> : null}

          <div style={{ fontWeight: 700 }}>每周上课时间 · 教室</div>
          <div style={{ overflowX: "auto", overflowY: "hidden" }}>
            <CourseScheduleFields slots={scheduleSlots} onChange={setScheduleSlots} />
          </div>

          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <label className="field">
              <span>学期开课日（可选）</span>
              <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
            </label>
            <label className="field">
              <span>学期结课日（可选）</span>
              <input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
            </label>
          </div>
        </form>

        <section className="card grid" style={{ gap: 14 }}>
          <div className="spread" style={{ alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 800 }}>课程资料</div>
              <div className="muted">资料管理入口保持独立，便于统一维护</div>
            </div>
            <Link to={`/courses/${courseId}/materials`} className="btn primary" style={{ width: "fit-content" }}>
              打开资料管理
            </Link>
          </div>

          <div className="card" style={{ padding: 14, background: "#f8fafc" }}>
            <div className="spread" style={{ alignItems: "center", marginBottom: 8 }}>
              <div>
                <div style={{ fontWeight: 700 }}>班级目录</div>
                <div className="muted">这里展示当前课程下的班级列表，可直接新增、重命名、删除。</div>
              </div>
              <button
                className="btn primary"
                type="button"
                onClick={async () => {
                  const name = newClassName.trim();
                  if (!name) return;
                  setBusy("class-add");
                  try {
                    await api.post(`/courses/${courseId}/classes`, { name });
                    setNewClassName("");
                    await reload();
                  } finally {
                    setBusy(null);
                  }
                }}
                disabled={busy === "class-add"}
              >
                {busy === "class-add" ? "添加中…" : "添加班级"}
              </button>
            </div>
            <input
              value={newClassName}
              onChange={(e) => setNewClassName(e.target.value)}
              placeholder="输入新班级名称"
            />
          </div>
        </section>
      </div>

      <div className="grid" style={{ marginTop: 16, gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))" }}>
        <section className="card" style={{ padding: 18 }}>
          <div className="spread" style={{ alignItems: "flex-start", gap: 12 }}>
            <div>
              <div style={{ fontWeight: 800 }}>班级列表</div>
              <div className="muted">采用表格卡片布局，更适合后台密集数据浏览</div>
            </div>
            <span className="status-badge status-badge--muted">{classes.length} 个班级</span>
          </div>

          <div className="data-table-wrap" style={{ marginTop: 14 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>班级名称</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {classes.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <input
                        defaultValue={c.name}
                        onBlur={async (e) => {
                          const name = e.target.value.trim();
                          if (!name || name === c.name) return;
                          setBusy(`rename-${c.id}`);
                          try {
                            await api.patch(`/courses/${courseId}/classes/${c.id}`, { name });
                            await reload();
                          } finally {
                            setBusy(null);
                          }
                        }}
                      />
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        className="btn danger"
                        onClick={async () => {
                          const ok = await confirm({
                            title: "删除班级",
                            message: "删除班级？学生将变为未分班。",
                            danger: true,
                          });
                          if (!ok) return;
                          setBusy(`delete-${c.id}`);
                          try {
                            await api.delete(`/courses/${courseId}/classes/${c.id}`);
                            await reload();
                          } finally {
                            setBusy(null);
                          }
                        }}
                        disabled={busy === `delete-${c.id}`}
                      >
                        {busy === `delete-${c.id}` ? "删除中…" : "删除"}
                      </button>
                    </td>
                  </tr>
                ))}
                {classes.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="muted">暂无班级，请先添加。</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card" style={{ padding: 18 }}>
          <div className="spread" style={{ alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 800 }}>学生分班</div>
              <div className="muted">右侧下拉选择即可完成分班调整</div>
            </div>
            <span className="status-badge status-badge--brand">{students.length} 名学生</span>
          </div>

          <div className="grid" style={{ marginTop: 14, gap: 12 }}>
            {students.map((s: any) => (
              <div key={s.id} className="card" style={{ padding: 14, background: "#f8fafc" }}>
                <div className="spread" style={{ alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{s.user.name}</div>
                    <div className="muted">{s.user.email}</div>
                  </div>
                  <select
                    value={s.classId ?? ""}
                    onChange={async (e) => {
                      const classId = e.target.value || null;
                      setBusy(`student-${s.id}`);
                      try {
                        await api.patch(`/courses/${courseId}/enrollments/${s.id}`, {
                          classId,
                        });
                        await reload();
                      } finally {
                        setBusy(null);
                      }
                    }}
                    disabled={busy === `student-${s.id}`}
                  >
                    <option value="">未分班</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
            {students.length === 0 ? <div className="muted">暂无选课学生</div> : null}
          </div>
        </section>
      </div>
    </div>
  );
}
