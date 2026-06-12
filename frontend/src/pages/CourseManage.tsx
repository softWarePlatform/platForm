import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useConfirm } from "../components/ui/ConfirmDialog";
import { coursePathForRole } from "../lib/coursePaths";
import CourseEnrollmentFields, {
  enrollmentFromCourse,
  enrollmentToPayload,
  useEnrollmentFieldOptions,
  type CourseEnrollmentDraft,
} from "../components/CourseEnrollmentFields";
import CourseScheduleFields, {
  slotsFromCourse,
  type ScheduleSlotDraft,
} from "../components/CourseScheduleFields";
import FormBlock from "../components/layout/FormBlock";
import PageHeader from "../components/layout/PageHeader";
import PageShell from "../components/layout/PageShell";
import Reveal from "../components/motion/Reveal";
import "./course-manage.css";

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CourseManage() {
  const { user } = useAuth();
  const { confirm } = useConfirm();
  const { courseId } = useParams();
  const [course, setCourse] = useState<any>(null);
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [scheduleSlots, setScheduleSlots] = useState<ScheduleSlotDraft[]>([]);
  const [enrollment, setEnrollment] = useState<CourseEnrollmentDraft | null>(null);
  const enrollmentOptions = useEnrollmentFieldOptions();
  const [kgText, setKgText] = useState("");
  const [, setMaterials] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [newClassName, setNewClassName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);

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
    setKgText(c.course.knowledgeGraphJson ?? "");
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
    }
  }

  async function saveGraphJson() {
    setErr(null);
    try {
      if (kgText.trim()) JSON.parse(kgText);
      await api.patch(`/courses/${courseId}`, { knowledgeGraphJson: kgText.trim() || null });
      await reload();
    } catch {
      setErr("知识图谱需为合法 JSON");
    }
  }

  async function generateGraph(save: boolean) {
    setErr(null);
    try {
      const { data } = await api.post(`/courses/${courseId}/knowledge-graph/generate`, { save });
      setKgText(JSON.stringify(data.graph, null, 2));
      if (save) await reload();
    } catch (e2: unknown) {
      const msg =
        typeof e2 === "object" && e2 !== null && "response" in e2
          ? (e2 as { response?: { data?: { error?: string } } }).response?.data?.error
          : null;
      setErr(msg ?? "生成失败");
    }
  }

  if (!course) {
    return (
      <PageShell className="teach-page">
        <div className="muted">{err ?? "加载中…"}</div>
      </PageShell>
    );
  }

  const courseHomePath = coursePathForRole(courseId!, "announcements", user?.role);
  const courseMaterialsPath = coursePathForRole(courseId!, "materials", user?.role);

  return (
    <PageShell className="teach-page">
      <div className="course-manage">
        <Reveal>
          <PageHeader
            title={`课程设置 · ${course.title}`}
            below={
              <p className="page-lead">
                <Link to={courseHomePath} className="dash-link-more">
                  ← 返回课程
                </Link>
              </p>
            }
          />
        </Reveal>

        {err ? <div className="page-alert err">{err}</div> : null}

        <Reveal delay={0.04}>
          <section className="dash-glass-panel course-manage-panel">
            <div className="dash-section-head">
              <h2 className="dash-section-head__title">选课系统 · 时间与地点</h2>
            </div>
            <div className="course-manage-panel__body">
              <form onSubmit={saveScheduleAndEnrollment}>
                <FormBlock title="选课信息">
                  {enrollment ? (
                    <CourseEnrollmentFields
                      value={enrollment}
                      onChange={setEnrollment}
                      options={enrollmentOptions}
                    />
                  ) : null}
                </FormBlock>

                <FormBlock title="每周上课时间 · 教室">
                  <CourseScheduleFields slots={scheduleSlots} onChange={setScheduleSlots} />
                </FormBlock>

                <FormBlock title="学期起止（可选）">
                  <div className="field-row">
                    <div className="field">
                      <label>学期开课日</label>
                      <input
                        type="datetime-local"
                        value={startAt}
                        onChange={(e) => setStartAt(e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label>学期结课日</label>
                      <input
                        type="datetime-local"
                        value={endAt}
                        onChange={(e) => setEndAt(e.target.value)}
                      />
                    </div>
                  </div>
                </FormBlock>

                <div className="form-actions">
                  <button className="btn primary" type="submit">
                    保存选课与时间安排
                  </button>
                  {saveOk ? <span className="save-ok">保存成功</span> : null}
                </div>
              </form>
            </div>
          </section>
        </Reveal>

        <Reveal delay={0.06}>
          <section className="dash-glass-panel course-manage-panel">
            <div className="dash-section-head">
              <h2 className="dash-section-head__title">课程资料</h2>
            </div>
            <div className="course-manage-materials-body">
              <p className="course-manage-materials-hint">
                上传课件、大纲与参考资料，学生可在课程资料页浏览与下载。
              </p>
              <Link to={courseMaterialsPath} className="btn primary">
                打开资料管理
              </Link>
            </div>
          </section>
        </Reveal>

        <Reveal delay={0.08}>
          <section className="dash-glass-panel course-manage-panel">
            <div className="dash-section-head">
              <h2 className="dash-section-head__title">知识图谱（JSON）</h2>
            </div>
            <div className="course-manage-panel__body">
              <div className="course-manage-kg-actions">
                <button type="button" className="btn primary" onClick={() => generateGraph(true)}>
                  自动生成并保存
                </button>
                <button type="button" className="btn" onClick={() => generateGraph(false)}>
                  仅预览不保存
                </button>
              </div>
              <textarea
                className="course-manage-kg-textarea"
                rows={12}
                value={kgText}
                onChange={(e) => setKgText(e.target.value)}
              />
              <div className="form-actions">
                <button className="btn primary" type="button" onClick={() => void saveGraphJson()}>
                  保存手动编辑
                </button>
              </div>
            </div>
          </section>
        </Reveal>

        <div className="course-manage-split">
          <Reveal delay={0.1}>
            <section className="dash-glass-panel course-manage-panel">
              <div className="dash-section-head">
                <h2 className="dash-section-head__title">班级</h2>
                <span className="teach-toolbar__hint">{classes.length} 个</span>
              </div>
              <div className="course-manage-panel__body">
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!newClassName.trim()) return;
                    await api.post(`/courses/${courseId}/classes`, { name: newClassName.trim() });
                    setNewClassName("");
                    await reload();
                  }}
                >
                  <div className="field">
                    <label>新建班级名称</label>
                    <input value={newClassName} onChange={(e) => setNewClassName(e.target.value)} />
                  </div>
                  <div className="form-actions">
                    <button className="btn primary" type="submit">
                      添加班级
                    </button>
                  </div>
                </form>

                <div className="course-manage-list">
                  {classes.map((c) => (
                    <div key={c.id} className="course-manage-class-row">
                      <input
                        className="course-manage-class-row__input"
                        defaultValue={c.name}
                        onBlur={async (e) => {
                          const name = e.target.value.trim();
                          if (!name || name === c.name) return;
                          await api.patch(`/courses/${courseId}/classes/${c.id}`, { name });
                          await reload();
                        }}
                      />
                      <button
                        type="button"
                        className="btn"
                        onClick={async () => {
                          const ok = await confirm({
                            title: "删除班级",
                            message: "删除班级？学生将变为未分班。",
                            danger: true,
                          });
                          if (!ok) return;
                          await api.delete(`/courses/${courseId}/classes/${c.id}`);
                          await reload();
                        }}
                      >
                        删除
                      </button>
                    </div>
                  ))}
                  {classes.length === 0 ? <div className="muted">暂无班级，请先添加</div> : null}
                </div>
              </div>
            </section>
          </Reveal>

          <Reveal delay={0.12}>
            <section className="dash-glass-panel course-manage-panel">
              <div className="dash-section-head">
                <h2 className="dash-section-head__title">学生分班</h2>
                <span className="teach-toolbar__hint">{students.length} 人</span>
              </div>
              <div className="course-manage-panel__body">
                <div className="course-manage-list">
                  {students.map((s: any) => (
                    <div key={s.id} className="course-manage-student-row">
                      <div className="course-manage-student-row__info">
                        <div className="course-manage-student-row__name">{s.user.name}</div>
                        <div className="course-manage-student-row__email">{s.user.email}</div>
                      </div>
                      <select
                        value={s.classId ?? ""}
                        onChange={async (e) => {
                          const classId = e.target.value || null;
                          await api.patch(`/courses/${courseId}/enrollments/${s.id}`, {
                            classId,
                          });
                          await reload();
                        }}
                      >
                        <option value="">未分班</option>
                        {classes.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                  {students.length === 0 ? <div className="muted">暂无选课学生</div> : null}
                </div>
              </div>
            </section>
          </Reveal>
        </div>
      </div>
    </PageShell>
  );
}
