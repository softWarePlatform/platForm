import { useEffect, useMemo, useState } from "react";
import { api } from "../../api/client";
import AdminLayout from "./AdminLayout";
import styles from "./admin.module.css";

type EnrollmentPeriod = {
  semesterKey: string;
  label?: string | null;
  phase: "PRESELECT" | "FORMAL" | "ADD_DROP" | "CLOSED";
  openAt: string;
  closeAt: string;
  confirmDeadline?: string | null;
};

type Semester = {
  key: string;
  label: string;
};

type PeriodResponse = {
  period: EnrollmentPeriod | null;
  semester: Semester;
};

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
};

type CourseRow = {
  id: string;
  title: string;
  courseCode?: string | null;
  capacity: number;
  teacher: { id: string; name: string };
};

type FieldOptions = {
  courseNatures?: Record<string, string>;
  subjectCategories?: Record<string, string>;
  offeringColleges?: Array<{ code: string; label: string }>;
  phases?: Record<string, string>;
};

function fmt(value?: string | null) {
  return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "-";
}

export default function AdminClass() {
  const [period, setPeriod] = useState<EnrollmentPeriod | null>(null);
  const [semester, setSemester] = useState<Semester | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingPeriod, setSavingPeriod] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [options, setOptions] = useState<FieldOptions>({});

  const [periodForm, setPeriodForm] = useState({
    phase: "FORMAL" as EnrollmentPeriod["phase"],
    openAt: "",
    closeAt: "",
    confirmDeadline: "",
    label: "",
  });
  const [manualForm, setManualForm] = useState({ userId: "", courseId: "", action: "enroll" as "enroll" | "drop" });

  const activePhaseLabel = useMemo(() => options.phases?.[period?.phase ?? "FORMAL"] ?? period?.phase ?? "-", [options, period]);

  const loadData = async () => {
    setLoading(true);
    setErr(null);
    try {
      const [periodRes, usersRes, coursesRes, optionsRes] = await Promise.all([
        api.get<PeriodResponse>("/enrollment/period"),
        api.get<{ users?: UserRow[] }>("/admin/users"),
        api.get<{ courses?: CourseRow[] }>("/courses/mine"),
        api.get<FieldOptions>("/courses/enrollment-field-options"),
      ]);
      setPeriod(periodRes.data.period);
      setSemester(periodRes.data.semester);
      setUsers(usersRes.data.users ?? []);
      setCourses(coursesRes.data.courses ?? []);
      setOptions(optionsRes.data);
      const p = periodRes.data.period;
      setPeriodForm({
        phase: p?.phase ?? "FORMAL",
        openAt: p?.openAt ?? "",
        closeAt: p?.closeAt ?? "",
        confirmDeadline: p?.confirmDeadline ?? "",
        label: p?.label ?? periodRes.data.semester.label ?? "",
      });
    } catch {
      setErr("加载选课配置失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const savePeriod = async () => {
    setSavingPeriod(true);
    setErr(null);
    setMsg(null);
    try {
      await api.put("/enrollment/period", {
        phase: periodForm.phase,
        label: periodForm.label || semester?.label,
        openAt: periodForm.openAt,
        closeAt: periodForm.closeAt,
        confirmDeadline: periodForm.confirmDeadline || null,
      });
      setMsg("选课时段已保存");
      await loadData();
    } catch (e: any) {
      setErr(e?.response?.data?.error ?? "保存失败");
    } finally {
      setSavingPeriod(false);
    }
  };

  const submitManual = async () => {
    setActionLoading(true);
    setErr(null);
    setMsg(null);
    try {
      const url = manualForm.action === "enroll" ? "/enrollment/admin/enroll" : "/enrollment/admin/drop";
      await api.post(url, { userId: manualForm.userId, courseId: manualForm.courseId });
      setMsg(manualForm.action === "enroll" ? "已手动加课" : "已手动退课");
    } catch (e: any) {
      setErr(e?.response?.data?.error ?? "操作失败");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <AdminLayout title="班级目录" subtitle="当前学期选课阶段、时段与特殊加退课">
      {err ? <div className="page-alert page-alert--warn">{err}</div> : null}
      {msg ? <div className="page-alert page-alert--success">{msg}</div> : null}
      {loading ? <div className="page-alert">加载中...</div> : null}

      <section className={styles.card}>
        <h2 className={styles.sectionTitle}>当前学期选课阶段与时段</h2>
        <div className={styles.cardGrid}>
          <div className={styles.card}>
            <div className={styles.quickTitle}>学期</div>
            <div className={styles.quickDesc}>{semester?.label ?? "-"}</div>
          </div>
          <div className={styles.card}>
            <div className={styles.quickTitle}>当前阶段</div>
            <div className={styles.quickDesc}>{activePhaseLabel}</div>
          </div>
          <div className={styles.card}>
            <div className={styles.quickTitle}>开放时间</div>
            <div className={styles.quickDesc}>{fmt(period?.openAt)}</div>
          </div>
          <div className={styles.card}>
            <div className={styles.quickTitle}>截止时间</div>
            <div className={styles.quickDesc}>{fmt(period?.closeAt)}</div>
          </div>
          <div className={styles.card}>
            <div className={styles.quickTitle}>确认截止时间</div>
            <div className={styles.quickDesc}>{fmt(period?.confirmDeadline)}</div>
          </div>
        </div>
      </section>

      <section className={styles.card} style={{ marginTop: 16 }}>
        <h2 className={styles.sectionTitle}>设置选课阶段与时段</h2>
        <div className={styles.cardGrid}>
          <label className={styles.field}>
            <span>学期名称</span>
            <input
              className="input"
              value={periodForm.label}
              onChange={(e) => setPeriodForm((prev) => ({ ...prev, label: e.target.value }))}
            />
          </label>
          <label className={styles.field}>
            <span>选课阶段</span>
            <select
              className="input"
              value={periodForm.phase}
              onChange={(e) => setPeriodForm((prev) => ({ ...prev, phase: e.target.value as EnrollmentPeriod["phase"] }))}
            >
              {Object.entries(options.phases ?? { PRESELECT: "预选", FORMAL: "正选", ADD_DROP: "补退选", CLOSED: "关闭" }).map(
                ([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ),
              )}
            </select>
          </label>
          <label className={styles.field}>
            <span>开放时间</span>
            <input
              className="input"
              type="datetime-local"
              value={periodForm.openAt ? periodForm.openAt.slice(0, 16) : ""}
              onChange={(e) => setPeriodForm((prev) => ({ ...prev, openAt: e.target.value }))}
            />
          </label>
          <label className={styles.field}>
            <span>截止时间</span>
            <input
              className="input"
              type="datetime-local"
              value={periodForm.closeAt ? periodForm.closeAt.slice(0, 16) : ""}
              onChange={(e) => setPeriodForm((prev) => ({ ...prev, closeAt: e.target.value }))}
            />
          </label>
          <label className={styles.field}>
            <span>确认截止时间</span>
            <input
              className="input"
              type="datetime-local"
              value={periodForm.confirmDeadline ? periodForm.confirmDeadline.slice(0, 16) : ""}
              onChange={(e) => setPeriodForm((prev) => ({ ...prev, confirmDeadline: e.target.value }))}
            />
          </label>
        </div>
        <div style={{ marginTop: 16 }}>
          <button className="btn primary" type="button" onClick={() => void savePeriod()} disabled={savingPeriod}>
            {savingPeriod ? "保存中..." : "保存选课配置"}
          </button>
        </div>
      </section>

      <section className={styles.card} style={{ marginTop: 16 }}>
        <h2 className={styles.sectionTitle}>特殊情况手动加退课</h2>
        <div className={styles.cardGrid}>
          <label className={styles.field}>
            <span>学生</span>
            <select
              className="input"
              value={manualForm.userId}
              onChange={(e) => setManualForm((prev) => ({ ...prev, userId: e.target.value }))}
            >
              <option value="">请选择学生</option>
              {users.filter((u) => u.role === "STUDENT").map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} · {u.email}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>课程</span>
            <select
              className="input"
              value={manualForm.courseId}
              onChange={(e) => setManualForm((prev) => ({ ...prev, courseId: e.target.value }))}
            >
              <option value="">请选择课程</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.courseCode ? `${c.courseCode} · ` : ""}{c.title} · {c.teacher.name}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>动作</span>
            <select
              className="input"
              value={manualForm.action}
              onChange={(e) => setManualForm((prev) => ({ ...prev, action: e.target.value as "enroll" | "drop" }))}
            >
              <option value="enroll">手动加课</option>
              <option value="drop">手动退课</option>
            </select>
          </label>
        </div>
        <div style={{ marginTop: 16 }}>
          <button
            className="btn primary"
            type="button"
            onClick={() => void submitManual()}
            disabled={actionLoading || !manualForm.userId || !manualForm.courseId}
          >
            {actionLoading ? "处理中..." : "提交操作"}
          </button>
        </div>
      </section>
    </AdminLayout>
  );
}
