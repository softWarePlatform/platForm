import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";

type CourseOption = { id: string; title: string };

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void | Promise<void>;
  /** 课程内创建时传入，固定课程且不再选课 */
  fixedCourseId?: string;
};

function defaultTitle() {
  return `新实验 ${new Date().toLocaleString()}`;
}

export default function CreateLabSetModal({ open, onClose, onCreated, fixedCourseId }: Props) {
  const inCourse = Boolean(fixedCourseId);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [courseId, setCourseId] = useState("");
  const [title, setTitle] = useState(() => defaultTitle());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCourseId(fixedCourseId ?? "");
    setTitle(defaultTitle());
    setErr(null);
    if (inCourse) {
      setCourses([]);
      setLoadingCourses(false);
      return;
    }
    setLoadingCourses(true);
    void api
      .get<{ courses: CourseOption[] }>("/courses/mine")
      .then(({ data }) => setCourses(data.courses ?? []))
      .catch(() => {
        setCourses([]);
        setErr("无法加载课程列表");
      })
      .finally(() => setLoadingCourses(false));
  }, [open, fixedCourseId, inCourse]);

  if (!open) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const targetCourseId = fixedCourseId ?? courseId;
    if (!targetCourseId) {
      setErr("请选择课程");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await api.post(`/courses/${targetCourseId}/lab-sets`, {
        title: title.trim() || defaultTitle(),
      });
      await onCreated();
      onClose();
    } catch (e2: unknown) {
      const msg =
        typeof e2 === "object" && e2 !== null && "response" in e2
          ? (e2 as { response?: { data?: { error?: string } } }).response?.data?.error
          : null;
      setErr(msg ?? "创建失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <form
        className="card modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-lab-set-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => void handleSubmit(e)}
      >
        <h3 id="create-lab-set-title" style={{ marginTop: 0 }}>
          新建实验集
        </h3>
        <p className="muted" style={{ margin: "0 0 16px", lineHeight: 1.6 }}>
          {inCourse ? "为本课程创建实验集，请填写标题。" : "先选择要布置实验的课程，再创建实验集。"}
        </p>

        {loadingCourses ? (
          <div className="muted">加载课程…</div>
        ) : !inCourse && courses.length === 0 ? (
          <div>
            <div className="muted" style={{ marginBottom: 12 }}>
              暂无可用课程。请先在教学台创建课程。
            </div>
            <Link className="btn primary" to="/teaching" onClick={onClose}>
              前往教学台
            </Link>
          </div>
        ) : (
          <>
            {!inCourse ? (
              <div className="field">
                <label htmlFor="create-lab-set-course">所属课程</label>
                <select
                  id="create-lab-set-course"
                  value={courseId}
                  onChange={(e) => setCourseId(e.target.value)}
                  required
                >
                  <option value="">请选择课程</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="field">
              <label htmlFor="create-lab-set-title-input">实验集标题</label>
              <input
                id="create-lab-set-title-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例如：第 1 次实验"
              />
            </div>
          </>
        )}

        {err ? <div className="err" style={{ marginTop: 10 }}>{err}</div> : null}

        <div className="row" style={{ marginTop: 16, gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="btn" onClick={onClose}>
            取消
          </button>
          {inCourse || courses.length > 0 ? (
            <button
              type="submit"
              className="btn primary"
              disabled={saving || !(fixedCourseId ?? courseId) || !title.trim()}
            >
              {saving ? "创建中…" : "创建"}
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
