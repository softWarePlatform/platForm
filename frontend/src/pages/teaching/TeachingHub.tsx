import { FormEvent, useEffect, useState } from "react";
import { api } from "../../api/client";
import CourseEnrollmentFields, {
  emptyEnrollmentDraft,
  enrollmentToPayload,
  useEnrollmentFieldOptions,
  type CourseEnrollmentDraft,
} from "../../components/CourseEnrollmentFields";
import CourseScheduleFields, {
  emptyScheduleSlot,
  type ScheduleSlotDraft,
} from "../../components/CourseScheduleFields";
import EmptyState from "../../components/layout/EmptyState";
import FormBlock from "../../components/layout/FormBlock";
import PageShell from "../../components/layout/PageShell";
import TeachingSubnav from "../../components/layout/TeachingSubnav";
import Reveal from "../../components/motion/Reveal";
import TeachingCourseCard from "../../features/teaching/TeachingCourseCard";
import TeachingWelcome from "../../features/teaching/TeachingWelcome";
import { useAuth } from "../../auth/AuthContext";

type CourseRow = {
  id: string;
  title: string;
  courseCode?: string | null;
  category?: string | null;
  published: boolean;
  capacity?: number | null;
  _count?: { enrollments?: number; labs?: number; homeworks?: number };
  scheduleSlots?: Array<{ dayOfWeek: number; periodStart: number; periodEnd: number; room: string }>;
};

export default function TeachingHub() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("程序设计");
  const [published, setPublished] = useState(false);
  const [scheduleSlots, setScheduleSlots] = useState<ScheduleSlotDraft[]>([emptyScheduleSlot()]);
  const [enrollment, setEnrollment] = useState<CourseEnrollmentDraft>(emptyEnrollmentDraft());
  const enrollmentOptions = useEnrollmentFieldOptions();
  const [err, setErr] = useState<string | null>(null);
  const [createOk, setCreateOk] = useState(false);

  async function reload() {
    const { data } = await api.get("/courses/mine");
    setCourses(data.courses);
  }

  useEffect(() => {
    reload().catch(() => setErr("加载失败"));
  }, []);

  async function createCourse(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setCreateOk(false);
    for (const s of scheduleSlots) {
      if (s.periodEnd < s.periodStart) {
        setErr("结束节次不能早于开始节次");
        return;
      }
    }
    try {
      await api.post("/courses", {
        title,
        description,
        category,
        published,
        ...enrollmentToPayload(enrollment),
        scheduleSlots: scheduleSlots.map((s) => ({
          dayOfWeek: s.dayOfWeek,
          periodStart: s.periodStart,
          periodEnd: s.periodEnd,
          room: s.room.trim(),
        })),
      });
      setTitle("");
      setDescription("");
      setScheduleSlots([emptyScheduleSlot()]);
      setEnrollment(emptyEnrollmentDraft());
      setCreateOk(true);
      window.setTimeout(() => setCreateOk(false), 3000);
      await reload();
    } catch (e2: unknown) {
      const msg =
        typeof e2 === "object" && e2 !== null && "response" in e2
          ? (e2 as { response?: { data?: { error?: string } } }).response?.data?.error
          : null;
      setErr(msg ?? "创建失败");
    }
  }

  if (!user) return <div className="container muted">加载中…</div>;

  return (
    <PageShell className="teach-page">
      <div className="teach-home">
        <Reveal>
          <TeachingWelcome name={user.name} section="课程" lead={`${courses.length} 门课程`} />
        </Reveal>

        <Reveal delay={0.04}>
          <TeachingSubnav />
        </Reveal>

        {err ? <div className="page-alert err">{err}</div> : null}

        <Reveal delay={0.06}>
          <section className="dash-glass-panel teach-courses-panel">
            <div className="dash-section-head">
              <h2 className="dash-section-head__title">我的课程</h2>
              <span className="teach-toolbar__hint">{courses.length} 门</span>
            </div>
            {courses.length === 0 ? (
              <EmptyState title="还没有课程" />
            ) : (
              <div className="teach-course-grid">
                {courses.map((c) => (
                  <TeachingCourseCard
                    key={c.id}
                    id={c.id}
                    title={c.title}
                    courseCode={c.courseCode}
                    category={c.category}
                    published={c.published}
                    capacity={c.capacity}
                    enrollments={c._count?.enrollments}
                    labs={c._count?.labs}
                    homeworks={c._count?.homeworks}
                    scheduleSlots={c.scheduleSlots}
                  />
                ))}
              </div>
            )}
          </section>
        </Reveal>

        <Reveal delay={0.08}>
          <details className="dash-glass-panel teach-create-details">
            <summary>新建课程</summary>
            <div className="teach-create-details__body">
              <form className="grid" onSubmit={createCourse}>
                <FormBlock title="基本信息">
                  <div className="field">
                    <label>标题</label>
                    <input value={title} onChange={(e) => setTitle(e.target.value)} required />
                  </div>
                  <div className="field">
                    <label>分类备注</label>
                    <input value={category} onChange={(e) => setCategory(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>简介</label>
                    <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
                  </div>
                </FormBlock>

                <FormBlock title="选课信息">
                  <CourseEnrollmentFields
                    value={enrollment}
                    onChange={setEnrollment}
                    options={enrollmentOptions}
                  />
                </FormBlock>

                <FormBlock title="上课时间">
                  <CourseScheduleFields slots={scheduleSlots} onChange={setScheduleSlots} />
                </FormBlock>

                <label className="check-row">
                  <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
                  <span>发布选课</span>
                </label>

                <div className="form-actions">
                  <button className="btn primary" type="submit">
                    创建课程
                  </button>
                  {createOk ? <span className="save-ok">已创建</span> : null}
                </div>
              </form>
            </div>
          </details>
        </Reveal>
      </div>
    </PageShell>
  );
}
