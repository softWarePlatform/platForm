import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../api/client";

type Course = {
  id: string;
  title: string;
  courseCode: string | null;
  credits: number;
  capacity: number;
  courseNature: "REQUIRED" | "RENXIU" | "ELECTIVE";
  subjectCategory: string;
  offeringCollegeCode: string | null;
  semesterKey: string;
  published: boolean;
  teacher?: { id: string; name: string };
  _count?: { enrollments: number };
};

type OptionMap = Record<string, string>;

type FieldOptions = {
  semester: { key: string; label: string };
  courseNatures: OptionMap;
  subjectCategories: OptionMap;
  offeringColleges: OptionMap;
};

const COURSE_NATURE_LABEL: OptionMap = {
  REQUIRED: "必修",
  RENXIU: "任选",
  ELECTIVE: "选修",
};

function getErrorMessage(e: unknown, fallback: string) {
  return typeof e === "object" && e !== null && "response" in e
    ? (e as { response?: { data?: { error?: string } } }).response?.data?.error ?? fallback
    : fallback;
}

export default function AdminCourses() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [options, setOptions] = useState<FieldOptions | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState({
    title: "",
    courseCode: "",
    credits: 2,
    capacity: 60,
    courseNature: "ELECTIVE" as Course["courseNature"],
    subjectCategory: "GENERAL_MAJOR",
    offeringCollegeCode: "",
    published: false,
  });

  const load = useCallback(async () => {
    setErr(null);
    const [{ data: mine }, { data: fieldOptions }] = await Promise.all([
      api.get<{ courses: Course[] }>("/courses/mine"),
      api.get<FieldOptions>("/courses/enrollment-field-options"),
    ]);
    setCourses(mine.courses ?? []);
    setOptions(fieldOptions);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await load();
      } catch (e) {
        if (!cancelled) setErr(getErrorMessage(e, "无法加载课程列表"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return courses;
    return courses.filter((c) =>
      [c.title, c.courseCode, c.teacher?.name, c.semesterKey]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)),
    );
  }, [courses, search]);

  const selected = useMemo(
    () => courses.find((course) => course.id === selectedId) ?? null,
    [courses, selectedId],
  );

  useEffect(() => {
    if (!selected) return;
    setForm({
      title: selected.title,
      courseCode: selected.courseCode ?? "",
      credits: selected.credits,
      capacity: selected.capacity,
      courseNature: selected.courseNature,
      subjectCategory: selected.subjectCategory,
      offeringCollegeCode: selected.offeringCollegeCode ?? "",
      published: selected.published,
    });
  }, [selected]);

  async function saveCourse() {
    if (!selected) {
      setErr("请先选择课程");
      return;
    }
    setSaving(true);
    setErr(null);
    setOkMsg(null);
    try {
      await api.patch(`/enrollment/courses/${selected.id}`, {
        title: form.title.trim(),
        courseCode: form.courseCode.trim() || null,
        credits: Number(form.credits),
        capacity: Number(form.capacity),
        courseNature: form.courseNature,
        subjectCategory: form.subjectCategory,
        offeringCollegeCode: form.offeringCollegeCode.trim() || null,
        published: form.published,
      });
      setOkMsg("课程选课字段已保存");
      await load();
    } catch (e) {
      setErr(getErrorMessage(e, "保存课程失败"));
    } finally {
      setSaving(false);
    }
  }

  async function deleteCourse() {
    if (!selected) {
      setErr("请先选择课程");
      return;
    }

    const courseLabel = selected.courseCode ? `${selected.courseCode} · ${selected.title}` : selected.title;
    const enrolledCount = selected._count?.enrollments ?? 0;
    const confirmed = window.confirm(
      `确定删除课程「${courseLabel}」？\n\n该操作不可恢复，将一并删除课程下的公告、资料、作业、实验、选课记录等关联数据。\n当前选课人数：${enrolledCount}`,
    );
    if (!confirmed) return;

    setDeleting(true);
    setErr(null);
    setOkMsg(null);
    try {
      await api.delete(`/enrollment/courses/${selected.id}`);
      setOkMsg(`已删除课程「${courseLabel}」`);
      setSelectedId("");
      await load();
    } catch (e) {
      setErr(getErrorMessage(e, "删除课程失败"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <header className="admin-page-header">
        <h1>课程运维</h1>
        <p className="muted" style={{ margin: 0 }}>
          调整课程容量、课程代码、学分、选课分类与发布状态，必要时删除课程
        </p>
      </header>

      {err ? <div className="err" style={{ marginBottom: 12 }}>{err}</div> : null}
      {okMsg ? <span className="save-ok" style={{ display: "block", marginBottom: 12 }}>{okMsg}</span> : null}

      {loading ? (
        <div className="muted">加载课程…</div>
      ) : (
        <div className="admin-form-grid admin-form-grid--wide-left">
          <section className="card admin-section-card">
            <h2>课程列表</h2>
            <label className="admin-field">
              <span>搜索</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="课程名 / 课程代码 / 教师 / 学期"
              />
            </label>
            <div className="admin-course-list">
              {filtered.map((course) => (
                <button
                  key={course.id}
                  type="button"
                  className={`admin-course-item${course.id === selectedId ? " active" : ""}`}
                  onClick={() => setSelectedId(course.id)}
                >
                  <strong>{course.title}</strong>
                  <span>
                    {course.courseCode ?? "无课程代码"} · {course.teacher?.name ?? "未知教师"} · 容量 {course.capacity}
                  </span>
                </button>
              ))}
              {filtered.length === 0 ? <p className="muted">没有匹配课程</p> : null}
            </div>
          </section>

          <section className="card admin-section-card">
            <h2>选课字段</h2>
            {!selected ? (
              <p className="muted">请选择左侧课程后编辑。</p>
            ) : (
              <>
                <p className="muted">
                  当前选课人数：{selected._count?.enrollments ?? 0} · 学期：{selected.semesterKey}
                </p>
                <label className="admin-field">
                  <span>课程名称</span>
                  <input value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} />
                </label>
                <div className="admin-two-col">
                  <label className="admin-field">
                    <span>课程代码</span>
                    <input
                      value={form.courseCode}
                      onChange={(e) => setForm((prev) => ({ ...prev, courseCode: e.target.value }))}
                    />
                  </label>
                  <label className="admin-field">
                    <span>容量</span>
                    <input
                      type="number"
                      min={1}
                      value={form.capacity}
                      onChange={(e) => setForm((prev) => ({ ...prev, capacity: Number(e.target.value) }))}
                    />
                  </label>
                </div>
                <div className="admin-two-col">
                  <label className="admin-field">
                    <span>学分</span>
                    <input
                      type="number"
                      min={1}
                      value={form.credits}
                      onChange={(e) => setForm((prev) => ({ ...prev, credits: Number(e.target.value) }))}
                    />
                  </label>
                  <label className="admin-field">
                    <span>课程性质</span>
                    <select
                      value={form.courseNature}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, courseNature: e.target.value as Course["courseNature"] }))
                      }
                    >
                      {Object.entries(options?.courseNatures ?? COURSE_NATURE_LABEL).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="admin-field">
                  <span>学科类别</span>
                  <select
                    value={form.subjectCategory}
                    onChange={(e) => setForm((prev) => ({ ...prev, subjectCategory: e.target.value }))}
                  >
                    {Object.entries(options?.subjectCategories ?? {}).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </label>
                <label className="admin-field">
                  <span>开课学院</span>
                  <select
                    value={form.offeringCollegeCode}
                    onChange={(e) => setForm((prev) => ({ ...prev, offeringCollegeCode: e.target.value }))}
                  >
                    <option value="">未设置</option>
                    {Object.entries(options?.offeringColleges ?? {}).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </label>
                <label className="admin-check-field">
                  <input
                    type="checkbox"
                    checked={form.published}
                    onChange={(e) => setForm((prev) => ({ ...prev, published: e.target.checked }))}
                  />
                  <span>发布到课程与选课目录</span>
                </label>
                <div className="admin-actions admin-danger-zone">
                  <button
                    type="button"
                    className="btn primary"
                    disabled={saving || deleting}
                    onClick={() => void saveCourse()}
                  >
                    {saving ? "保存中…" : "保存课程字段"}
                  </button>
                  <button
                    type="button"
                    className="btn admin-danger-btn"
                    disabled={saving || deleting}
                    onClick={() => void deleteCourse()}
                  >
                    {deleting ? "删除中…" : "删除课程"}
                  </button>
                </div>
                <p className="muted" style={{ marginTop: 10 }}>
                  删除课程会级联移除该课程下的选课、作业、实验、公告与资料等数据，请谨慎操作。
                </p>
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}
