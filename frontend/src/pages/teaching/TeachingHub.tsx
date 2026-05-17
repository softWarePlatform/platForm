import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import CourseScheduleFields, {
  emptyScheduleSlot,
  formatScheduleSummary,
  type ScheduleSlotDraft,
} from "../../components/CourseScheduleFields";

export default function TeachingHub() {
  const [courses, setCourses] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("程序设计");
  const [published, setPublished] = useState(false);
  const [scheduleSlots, setScheduleSlots] = useState<ScheduleSlotDraft[]>([emptyScheduleSlot()]);
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
    try {
      await api.post("/courses", {
        title,
        description,
        category,
        published,
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

  return (
    <div className="container">
      <div className="spread" style={{ marginTop: 10, alignItems: "flex-start" }}>
        <div>
          <h2 style={{ margin: 0 }}>教学台</h2>
          <div className="muted" style={{ marginTop: 8 }}>
            创建课程、发布内容；进入课程主页可管理公告、作业、实验与成绩。
          </div>
        </div>
        <Link className="btn primary" to="/teaching/homework">
          作业测评
        </Link>
      </div>

      <div className="grid" style={{ marginTop: 16, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        <form className="card grid" onSubmit={createCourse}>
          <div style={{ fontWeight: 900 }}>新建课程</div>
          <div className="field">
            <label>标题</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="field">
            <label>分类</label>
            <input value={category} onChange={(e) => setCategory(e.target.value)} />
          </div>
          <div className="field">
            <label>简介</label>
            <textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div style={{ fontWeight: 700, marginTop: 4 }}>每周上课时间</div>
          <CourseScheduleFields slots={scheduleSlots} onChange={setScheduleSlots} />
          <label className="row">
            <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
            <span className="muted">发布后对学生可见</span>
          </label>
          {err ? <div className="err">{err}</div> : null}
          <div className="row" style={{ alignItems: "center", gap: 12 }}>
            <button className="btn primary" type="submit">
              创建
            </button>
            {createOk ? <span className="save-ok">创建成功</span> : null}
          </div>
        </form>

        <div className="card">
          <div style={{ fontWeight: 900 }}>我的课程</div>
          <div className="grid" style={{ marginTop: 12 }}>
            {courses.map((c) => (
              <div key={c.id} className="row spread" style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                <div>
                  <div style={{ fontWeight: 850 }}>{c.title}</div>
                  <div className="muted">
                    {c.published ? "已发布" : "未发布"} · 选课 {c._count?.enrollments ?? 0} · 实验 {c._count?.labs ?? 0}{" "}
                    · 作业 {c._count?.homeworks ?? 0}
                  </div>
                  {c.scheduleSlots?.length ? (
                    <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                      {formatScheduleSummary(c.scheduleSlots)}
                    </div>
                  ) : null}
                </div>
                <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
                  <Link className="btn primary" to={`/courses/${c.id}/manage`}>
                    课程管理
                  </Link>
                  <Link className="btn" to={`/courses/${c.id}/announcements`}>
                    打开课程
                  </Link>
                  <Link className="btn" to={`/courses/${c.id}/homework`}>
                    作业管理
                  </Link>
                  <Link className="btn" to={`/courses/${c.id}/gradebook`}>
                    成绩册
                  </Link>
                </div>
              </div>
            ))}
            {courses.length === 0 ? <div className="muted">暂无课程</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
