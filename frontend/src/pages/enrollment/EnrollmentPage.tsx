import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { getApiError } from "../../api/errors";
import { api } from "../../api/client";
import { useConfirm } from "../../components/ui/ConfirmDialog";
import { useToast } from "../../components/ui/Toast";
import { useAuth } from "../../auth/AuthContext";
import WeeklySchedule from "../../features/dashboard/WeeklySchedule";
import type { DashboardPayload } from "../../features/dashboard/types";
import CourseEnrollmentTable from "./CourseEnrollmentTable";
import EnrollmentFilterPanel from "./EnrollmentFilterPanel";
import EnrollmentSearchBar, { type SearchFields } from "./EnrollmentSearchBar";
import { buildCatalogQueryString } from "./catalogParams";
import type { CatalogCourse, ClassRecommendation, EnrollWindow } from "./enrollmentTypes";
import "./enrollment.css";

type MainTab = "recommend" | "catalog" | "selected" | "timetable" | "logs" | "admin";
type LabelMaps = {
  subjectCategories: Record<string, string>;
  courseNatures: Record<string, string>;
  offeringColleges: Record<string, string>;
};

type EnrollmentPeriodForm = {
  label: string;
  phase: "PRESELECT" | "FORMAL" | "ADD_DROP" | "CLOSED";
  openAt: string;
  closeAt: string;
  confirmDeadline: string;
};

const LOG_LABELS: Record<string, string> = {
  ENROLL: "\u9009\u8bfe",
  DROP: "\u9000\u8bfe",
  WAITLIST_JOIN: "\u52a0\u5165\u5019\u8865",
  WAITLIST_LEAVE: "\u53d6\u6d88\u5019\u8865",
  WAITLIST_PROMOTED: "\u5019\u8865\u8f6c\u6b63",
  ADMIN_ENROLL: "\u7ba1\u7406\u5458\u52a0\u8bfe",
  ADMIN_DROP: "\u7ba1\u7406\u5458\u9000\u8bfe",
  TIMETABLE_CONFIRM: "\u786e\u8ba4\u8bfe\u8868",
};

const EMPTY_SEARCH: SearchFields = {
  courseCode: "",
  teacher: "",
  scheduleTime: "",
  scheduleRoom: "",
  className: "",
};

export default function EnrollmentPage() {
  const { confirm } = useConfirm();
  const { success } = useToast();
  const { user } = useAuth();
  const location = useLocation();
  const isAdmin = user?.role === "ADMIN";
  const isAdminEnrollPage = location.pathname.startsWith("/admin/enrollment");

  const [mainTab, setMainTab] = useState<MainTab>(isAdminEnrollPage ? "admin" : "recommend");
  const [enrollWindow, setEnrollWindow] = useState<EnrollWindow | null>(null);
  const [labels, setLabels] = useState<LabelMaps | null>(null);
  const [periodForm, setPeriodForm] = useState<EnrollmentPeriodForm>({
    label: "",
    phase: "FORMAL",
    openAt: "",
    closeAt: "",
    confirmDeadline: "",
  });

  const [recommendation, setRecommendation] = useState<ClassRecommendation | null>(null);
  const [recLoading, setRecLoading] = useState(true);

  const [search, setSearch] = useState<SearchFields>(EMPTY_SEARCH);
  const [natures, setNatures] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [colleges, setColleges] = useState<string[]>([]);

  const [courses, setCourses] = useState<CatalogCourse[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminActionBusy, setAdminActionBusy] = useState<string | null>(null);
  const [adminUserId, setAdminUserId] = useState("");
  const [adminCourseId, setAdminCourseId] = useState("");

  const [logs, setLogs] = useState<
    Array<{
      id: string;
      action: string;
      createdAt: string;
      course: { title: string; courseCode: string | null };
    }>
  >([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);

  const selectedCourses = useMemo(() => courses.filter((c) => c.isEnrolled), [courses]);

  const catalogCourses = useMemo(() => {
    return courses.filter((c) => {
      if (natures.length && !natures.includes(c.courseNature)) return false;
      if (categories.length && !categories.includes(c.subjectCategory)) return false;
      if (colleges.length) {
        if (!c.offeringCollegeCode || !colleges.includes(c.offeringCollegeCode)) return false;
      }
      return true;
    });
  }, [courses, natures, categories, colleges]);

  const loadStatus = useCallback(async () => {
    const { data } = await api.get("/enrollment/status");
    setEnrollWindow(data.window);
    setLabels(data.labels);
  }, []);

  const loadPeriod = useCallback(async () => {
    if (!isAdmin) return;
    const { data } = await api.get("/enrollment/period");
    const period = data.period;
    if (period) {
      setPeriodForm({
        label: period.label ?? data.semester.label,
        phase: period.phase,
        openAt: new Date(period.openAt).toISOString().slice(0, 16),
        closeAt: new Date(period.closeAt).toISOString().slice(0, 16),
        confirmDeadline: period.confirmDeadline ? new Date(period.confirmDeadline).toISOString().slice(0, 16) : "",
      });
    } else {
      const now = new Date();
      const open = new Date(now.getTime() - 24 * 3600 * 1000).toISOString().slice(0, 16);
      const close = new Date(now.getTime() + 7 * 24 * 3600 * 1000).toISOString().slice(0, 16);
      setPeriodForm({ label: data.semester.label, phase: "FORMAL", openAt: open, closeAt: close, confirmDeadline: "" });
    }
  }, [isAdmin]);

  const loadDashboard = useCallback(async () => {
    setDashboardLoading(true);
    try {
      const { data } = await api.get<DashboardPayload>("/dashboard/me");
      setDashboard(data);
    } catch {
      setDashboard(null);
    } finally {
      setDashboardLoading(false);
    }
  }, []);

  const loadRecommendations = useCallback(async () => {
    setRecLoading(true);
    try {
      const { data } = await api.get("/enrollment/class-recommendations");
      setRecommendation(data.recommendation);
      if (data.window) setEnrollWindow(data.window);
    } catch {
      setRecommendation(null);
    } finally {
      setRecLoading(false);
    }
  }, []);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setError(null);
    try {
      const qs = buildCatalogQueryString({
        courseCode: search.courseCode,
        teacher: search.teacher,
        className: search.className,
        scheduleTime: search.scheduleTime,
        scheduleRoom: search.scheduleRoom,
        courseNatures: natures,
        subjectCategories: categories,
        offeringColleges: colleges,
      });

      const { data } = await api.get(`/enrollment/catalog${qs}`);
      setCourses(data.courses ?? []);
      if (data.window) setEnrollWindow(data.window);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? "\u52a0\u8f7d\u5931\u8d25");
    } finally {
      setCatalogLoading(false);
    }
  }, [search, natures, categories, colleges]);

  useEffect(() => {
    loadStatus().catch(() => {});
    if (!isAdminEnrollPage) {
      loadRecommendations().catch(() => {});
    }
    loadPeriod().catch(() => {});
  }, [loadStatus, loadRecommendations, loadPeriod, isAdminEnrollPage]);

  useEffect(() => {
    if (mainTab === "catalog" || mainTab === "selected") {
      const t = setTimeout(() => loadCatalog().catch(() => {}), 280);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [mainTab, loadCatalog]);

  useEffect(() => {
    if (mainTab === "timetable") loadDashboard().catch(() => {});
  }, [mainTab, loadDashboard]);

  useEffect(() => {
    if (mainTab === "logs") {
      setLogsLoading(true);
      api
        .get("/enrollment/logs")
        .then(({ data }) => setLogs(data.logs ?? []))
        .catch(() => setLogs([]))
        .finally(() => setLogsLoading(false));
    }
  }, [mainTab]);

  const refreshAll = async () => {
    await Promise.all([
      loadStatus(),
      loadRecommendations(),
      loadCatalog(),
      loadDashboard(),
      loadPeriod(),
    ]);
  };

  const runAction = async (courseId: string, fn: () => Promise<unknown>) => {
    setBusyId(courseId);
    setError(null);
    try {
      await fn();
      await refreshAll();
    } catch (e: unknown) {
      setError(getApiError(e, "\u64cd\u4f5c\u5931\u8d25"));
    } finally {
      setBusyId(null);
    }
  };

  const savePeriod = async () => {
    setAdminBusy(true);
    setError(null);
    try {
      await api.put("/enrollment/period", {
        label: periodForm.label,
        phase: periodForm.phase,
        openAt: periodForm.openAt,
        closeAt: periodForm.closeAt,
        confirmDeadline: periodForm.confirmDeadline || null,
      });
      success("选课时段已保存");
      await refreshAll();
    } catch (e) {
      setError(getApiError(e, "保存失败"));
    } finally {
      setAdminBusy(false);
    }
  };

  const adminEnroll = async () => {
    if (!adminUserId || !adminCourseId) {
      setError("请填写用户ID和课程ID");
      return;
    }
    setAdminActionBusy("enroll");
    try {
      await api.post("/enrollment/admin/enroll", { userId: adminUserId, courseId: adminCourseId });
      success("已手动加课");
      await refreshAll();
    } catch (e) {
      setError(getApiError(e, "手动加课失败"));
    } finally {
      setAdminActionBusy(null);
    }
  };

  const adminDrop = async () => {
    if (!adminUserId || !adminCourseId) {
      setError("请填写用户ID和课程ID");
      return;
    }
    const ok = await confirm({ title: "手动退课", message: "确认执行手动退课吗？", danger: true });
    if (!ok) return;
    setAdminActionBusy("drop");
    try {
      await api.post("/enrollment/admin/drop", { userId: adminUserId, courseId: adminCourseId });
      success("已手动退课");
      await refreshAll();
    } catch (e) {
      setError(getApiError(e, "手动退课失败"));
    } finally {
      setAdminActionBusy(null);
    }
  };

  const handlers = {
    onEnroll: (id: string, classId?: string) =>
      void runAction(id, () => api.post(`/enrollment/courses/${id}/enroll`, { classId })),
    onDrop: (id: string) => {
      void (async () => {
        const ok = await confirm({ title: "退课", message: "确认退课？" });
        if (!ok) return;
        await runAction(id, () => api.delete(`/enrollment/courses/${id}/enroll`));
        success("已退课");
      })();
    },
    onWaitlist: (id: string) => void runAction(id, () => api.post(`/enrollment/courses/${id}/waitlist`)),
    onLeaveWaitlist: (id: string) =>
      void runAction(id, () => api.delete(`/enrollment/courses/${id}/waitlist`)),
  };

  const open = enrollWindow?.open ?? true;
  const displayCourses =
    mainTab === "selected"
      ? selectedCourses
      : mainTab === "recommend"
        ? recommendation?.courses ?? []
        : catalogCourses;

  return (
    <div className="enroll-page">
      <nav className="enroll-main-nav">
        <div className="enroll-main-nav-inner">
          {(isAdminEnrollPage
            ? ([
                ["admin", "\u7ba1\u7406\u914d\u7f6e"],
                ["logs", "\u9000\u8bfe\u65e5\u5fd7"],
              ] as const)
            : ([
                ["recommend", "\u73ed\u7ea7\u8bfe\u8868\u63a8\u8350\u8bfe\u7a0b"],
                ["catalog", "\u5168\u6821\u8bfe\u7a0b\u67e5\u8be2"],
                ["selected", "\u5df2\u9009\u8bfe\u7a0b"],
                ["timetable", "\u6211\u7684\u8bfe\u8868"],
                ["logs", "\u9000\u8bfe\u65e5\u5fd7"],
              ] as const)
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`enroll-nav-item${mainTab === key ? " active" : ""}`}
              onClick={() => setMainTab(key)}
            >
              {label}
            </button>
          ))}
          {isAdmin ? (
            <button
              type="button"
              className={`enroll-nav-item${mainTab === "admin" ? " active" : ""}`}
              onClick={() => setMainTab("admin")}
            >
              {"\u7ba1\u7406\u914d\u7f6e"}
            </button>
          ) : null}
        </div>
      </nav>

      <div className="enroll-body">
        {enrollWindow ? (
          <div className="enroll-status-bar">
            <span>
              <strong>{enrollWindow.semesterLabel}</strong> {enrollWindow.phaseLabel}
            </span>
            <span style={{ color: open ? "#166534" : "#c2410c" }}>{enrollWindow.message}</span>
            {mainTab === "catalog" && !catalogLoading ? (
              <span>
                {"\u5339\u914d "}
                <strong>{catalogCourses.length}</strong>
                {" \u95e8\u8bfe\u7a0b"}
              </span>
            ) : null}
          </div>
        ) : null}

        {error ? <div className="enroll-err">{error}</div> : null}

        {isAdminEnrollPage ? (
          <div className="card-stack" style={{ display: "grid", gap: 16 }}>
            <section className="enroll-recommend-panel">
              <h3>当前学期选课阶段与时段</h3>
              <p style={{ marginTop: 8, color: "#475569" }}>
                保存后会立即生效，正在选课的学生将实时看到阶段与时间变化。请确认时间配置无误，避免影响全站选课。
              </p>
              <div className="form-grid" style={{ marginTop: 12 }}>
                <label className="form-field">
                  <span>学期名称</span>
                  <input value={periodForm.label} onChange={(e) => setPeriodForm((p) => ({ ...p, label: e.target.value }))} />
                </label>
                <label className="form-field">
                  <span>阶段</span>
                  <select value={periodForm.phase} onChange={(e) => setPeriodForm((p) => ({ ...p, phase: e.target.value as EnrollmentPeriodForm["phase"] }))}>
                    <option value="PRESELECT">预选课</option>
                    <option value="FORMAL">正选</option>
                    <option value="ADD_DROP">补退选</option>
                    <option value="CLOSED">已关闭</option>
                  </select>
                </label>
                <label className="form-field">
                  <span>开始时间</span>
                  <input type="datetime-local" value={periodForm.openAt} onChange={(e) => setPeriodForm((p) => ({ ...p, openAt: e.target.value }))} />
                </label>
                <label className="form-field">
                  <span>结束时间</span>
                  <input type="datetime-local" value={periodForm.closeAt} onChange={(e) => setPeriodForm((p) => ({ ...p, closeAt: e.target.value }))} />
                </label>
                <label className="form-field">
                  <span>确认截止时间（可选）</span>
                  <input type="datetime-local" value={periodForm.confirmDeadline} onChange={(e) => setPeriodForm((p) => ({ ...p, confirmDeadline: e.target.value }))} />
                </label>
              </div>
              <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button type="button" className="btn primary" onClick={savePeriod} disabled={adminBusy}>
                  {adminBusy ? "保存中…" : "保存并立即生效"}
                </button>
                <span className="muted" style={{ alignSelf: "center" }}>
                  修改会立即影响前台选课状态，请谨慎操作。
                </span>
              </div>
            </section>

            <section className="enroll-recommend-panel">
              <h3>特殊情况手动加退课</h3>
              <p style={{ marginTop: 8, color: "#475569" }}>
                适用于补录、修正或紧急处理。执行后会立即写入选课记录与日志。
              </p>
              <div className="form-grid" style={{ marginTop: 12 }}>
                <label className="form-field">
                  <span>用户ID</span>
                  <input value={adminUserId} onChange={(e) => setAdminUserId(e.target.value)} placeholder="输入用户 UUID" />
                </label>
                <label className="form-field">
                  <span>课程ID</span>
                  <input value={adminCourseId} onChange={(e) => setAdminCourseId(e.target.value)} placeholder="输入课程 UUID" />
                </label>
              </div>
              <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button type="button" className="btn primary" onClick={adminEnroll} disabled={adminActionBusy === "enroll"}>
                  {adminActionBusy === "enroll" ? "加课中…" : "手动加课"}
                </button>
                <button type="button" className="btn danger" onClick={adminDrop} disabled={adminActionBusy === "drop"}>
                  {adminActionBusy === "drop" ? "退课中…" : "手动退课"}
                </button>
              </div>
            </section>
          </div>
        ) : mainTab === "recommend" && recommendation ? (
          <section className="enroll-recommend-panel">
            <h3>
              {"\u73ed\u7ea7\u8bfe\u8868\u63a8\u8350 \u00b7 "}
              {recommendation.className}
            </h3>
            <p style={{ margin: 0 }}>
              {recommendation.message}
              {" \u00b7 \u540c\u73ed\u53c2\u8003 "}
              {recommendation.peerCount}
              {" \u4eba"}
            </p>
          </section>
        ) : mainTab === "catalog" && labels ? (
          <>
            <EnrollmentFilterPanel
              options={labels}
              natures={natures}
              categories={categories}
              colleges={colleges}
              onNaturesChange={setNatures}
              onCategoriesChange={setCategories}
              onCollegesChange={setColleges}
            />
            <EnrollmentSearchBar value={search} onChange={setSearch} />
          </>
        ) : mainTab === "logs" ? (
          <div className="enroll-table-wrap">
            {logsLoading ? (
              <div className="enroll-empty">{"\u52a0\u8f7d\u4e2d\u2026"}</div>
            ) : (
              <table className="enroll-log-table">
                <thead>
                  <tr>
                    <th>{"\u65f6\u95f4"}</th>
                    <th>{"\u64cd\u4f5c"}</th>
                    <th>{"\u8bfe\u7a0b"}</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id}>
                      <td>{new Date(log.createdAt).toLocaleString("zh-CN")}</td>
                      <td>{LOG_LABELS[log.action] ?? log.action}</td>
                      <td>
                        {log.course.courseCode ? `${log.course.courseCode} ` : ""}
                        {log.course.title}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {!logsLoading && logs.length === 0 ? (
              <div className="enroll-empty">{"\u6682\u65e0\u8bb0\u5f55"}</div>
            ) : null}
          </div>
        ) : mainTab === "timetable" ? (
          dashboardLoading ? (
            <div className="enroll-empty">{"\u52a0\u8f7d\u8bfe\u8868\u4e2d\u2026"}</div>
          ) : dashboard ? (
            <WeeklySchedule
              embedded
              courses={dashboard.courses}
              deadlines={dashboard.deadlines}
              semesterLabel={dashboard.semester.label}
              userName={user?.name ?? ""}
            />
          ) : (
            <div className="enroll-empty">{"\u65e0\u6cd5\u52a0\u8f7d\u8bfe\u8868\uff0c\u8bf7\u5237\u65b0\u91cd\u8bd5"}</div>
          )
        ) : null}
      </div>
    </div>
  );
}
