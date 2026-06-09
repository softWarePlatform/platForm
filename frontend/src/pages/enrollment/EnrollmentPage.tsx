import { useCallback, useEffect, useMemo, useState } from "react";
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
  const isAdmin = user?.role === "ADMIN";

  const [mainTab, setMainTab] = useState<MainTab>("recommend");
  const [enrollWindow, setEnrollWindow] = useState<EnrollWindow | null>(null);
  const [labels, setLabels] = useState<LabelMaps | null>(null);

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

  /** 前端二次校验：三模块 AND（与后端一致，防止 query 序列化异常） */
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
    loadRecommendations().catch(() => {});
  }, [loadStatus, loadRecommendations]);

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
          {(
            [
              ["recommend", "\u73ed\u7ea7\u8bfe\u8868\u63a8\u8350\u8bfe\u7a0b"],
              ["catalog", "\u5168\u6821\u8bfe\u7a0b\u67e5\u8be2"],
              ["selected", "\u5df2\u9009\u8bfe\u7a0b"],
              ["timetable", "\u6211\u7684\u8bfe\u8868"],
              ["logs", "\u9000\u8bfe\u65e5\u5fd7"],
            ] as const
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

        {mainTab === "recommend" && recommendation ? (
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
        ) : null}

        {mainTab === "catalog" && labels ? (
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
        ) : null}

        {mainTab === "logs" ? (
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
        ) : mainTab === "admin" && isAdmin ? (
          <div className="enroll-empty">{"\u7ba1\u7406\u5458\u914d\u7f6e\u8bf7\u4f7f\u7528\u539f\u6709\u63a5\u53e3\uff1b\u672c\u9875\u9762\u4ee5\u5b66\u751f\u9009\u8bfe\u4e3a\u4e3b\u3002"}</div>
        ) : (
          <CourseEnrollmentTable
            courses={displayCourses}
            loading={mainTab === "recommend" ? recLoading : catalogLoading}
            open={open}
            busyId={busyId}
            showRecommendBadge={mainTab === "recommend"}
            emptyText={
              mainTab === "selected"
                ? "\u6682\u672a\u9009\u8bfe\uff0c\u8bf7\u5728\u63a8\u8350\u6216\u5168\u6821\u8bfe\u7a0b\u4e2d\u9009\u8bfe"
                : "\u6682\u65e0\u8bfe\u7a0b"
            }
            {...handlers}
          />
        )}
      </div>
    </div>
  );
}
