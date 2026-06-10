import { useEffect, useMemo, useState } from "react";
import { api } from "../../api/client";
import AdminLayout from "./AdminLayout";
import styles from "./admin.module.css";

type CourseRow = {
  id: string;
  title: string;
  courseCode?: string | null;
  teacher?: { id: string; name: string };
};

type HomeworkColumn = {
  id: string;
  title: string;
  dueAt?: string | null;
  published: boolean;
  targetClassName?: string | null;
};

type StudentRow = {
  user: { id: string; name: string; email: string };
  className?: string | null;
  submitted: number;
  released: number;
  total: number;
  completionRate?: number | null;
  cells: Array<{
    homeworkId: string;
    status: string;
    statusLabel: string;
    submittedAt?: string | null;
    score?: number | null;
    released: boolean;
    redoPending: boolean;
  }>;
};

type LogRow = {
  id: string;
  time: string;
  type: string;
  title: string;
  studentName: string;
  studentEmail: string;
  homeworkTitle: string;
  detail: string;
};

type CompletionResponse = {
  course: { id: string; title: string; teacher?: { id: string; name: string; email: string } };
  homeworks: HomeworkColumn[];
  students: StudentRow[];
  logs: LogRow[];
  summary: {
    studentCount: number;
    homeworkCount: number;
    submittedCount: number;
    totalRequiredCount: number;
  };
};

function fmt(value?: string | null) {
  return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "-";
}

function pct(value?: number | null) {
  if (value == null) return "-";
  return `${Math.round(value * 100)}%`;
}

function statusClass(status: string) {
  if (status === "RELEASED") return `${styles.logPill} ${styles.statusOk ?? ""}`;
  if (status === "GRADED" || status === "SUBMITTED") return styles.logPill;
  if (status === "REDO_PENDING") return `${styles.logPill} ${styles.statusWarn ?? ""}`;
  return `${styles.logPill} ${styles.statusMuted ?? ""}`;
}

export default function AdminHomeworkCompletion() {
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [courseId, setCourseId] = useState("");
  const [data, setData] = useState<CompletionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get<{ courses?: CourseRow[] }>("/courses/mine");
        if (!cancelled) {
          const list = data.courses ?? [];
          setCourses(list);
          setCourseId((prev) => prev || list[0]?.id || "");
        }
      } catch {
        if (!cancelled) setErr("课程列表加载失败");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!courseId) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErr(null);
    (async () => {
      try {
        const { data } = await api.get<CompletionResponse>("/admin/homework-completion", {
          params: { courseId },
        });
        if (!cancelled) setData(data);
      } catch (e: any) {
        if (!cancelled) setErr(e?.response?.data?.error ?? "作业完成情况加载失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  const completionRate = useMemo(() => {
    const summary = data?.summary;
    if (!summary || summary.totalRequiredCount === 0) return null;
    return summary.submittedCount / summary.totalRequiredCount;
  }, [data]);

  return (
    <AdminLayout title="作业完成情况" subtitle="按课程查看学生作业完成矩阵和课程作业日志记录">
      {err ? <div className="page-alert page-alert--warn">{err}</div> : null}
      {loading ? <div className="page-alert">加载作业完成情况中...</div> : null}

      <section className={styles.panel}>
        <div className={styles.sectionHeader}>
          <div>
            <h3 className={styles.sectionTitle}>选择课程</h3>
            <p className={styles.sectionSubtitle}>选择一门课程后，系统会汇总该课程所有学生的作业提交、批改、发布和重做申请日志。</p>
          </div>
          <span className={styles.sectionTag}>管理员可见</span>
        </div>
        <div className={styles.formGrid}>
          <label className={styles.field}>
            <span>课程</span>
            <select className="input" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
              <option value="">请选择课程</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.courseCode ? `${course.courseCode} · ` : ""}
                  {course.title}
                  {course.teacher?.name ? ` · ${course.teacher.name}` : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {data ? (
        <>
          <section className={styles.panel} style={{ marginTop: 16 }}>
            <div className={styles.summaryBar}>
              <article>
                <div className={styles.summaryLabel}>学生数</div>
                <div className={styles.summaryValue}>{data.summary.studentCount}</div>
              </article>
              <article>
                <div className={styles.summaryLabel}>作业数</div>
                <div className={styles.summaryValue}>{data.summary.homeworkCount}</div>
              </article>
              <article>
                <div className={styles.summaryLabel}>总体完成率</div>
                <div className={styles.summaryValue}>{pct(completionRate)}</div>
              </article>
            </div>
          </section>

          <section className={styles.panel} style={{ marginTop: 16 }}>
            <div className={styles.sectionHeader}>
              <div>
                <h3 className={styles.sectionTitle}>学生完成矩阵</h3>
                <p className={styles.sectionSubtitle}>{data.course.title} · 任课教师：{data.course.teacher?.name ?? "-"}</p>
              </div>
            </div>
            <div className={styles.adminLogTableWrap}>
              <table className={styles.adminLogTable}>
                <thead>
                  <tr>
                    <th>学生</th>
                    <th>班级</th>
                    <th>完成率</th>
                    {data.homeworks.map((homework) => (
                      <th key={homework.id}>
                        {homework.title}
                        <div className={styles.summaryLabel}>
                          {homework.targetClassName ? `班级：${homework.targetClassName}` : "全课"}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.students.length ? data.students.map((student) => (
                    <tr key={student.user.id}>
                      <td>
                        <strong>{student.user.name}</strong>
                        <div className={styles.summaryLabel}>{student.user.email}</div>
                      </td>
                      <td>{student.className ?? "-"}</td>
                      <td>{student.total ? `${student.submitted}/${student.total} · ${pct(student.completionRate)}` : "-"}</td>
                      {student.cells.map((cell) => (
                        <td key={`${student.user.id}-${cell.homeworkId}`}>
                          <span className={statusClass(cell.status)}>{cell.statusLabel}</span>
                          {cell.score != null ? <div className={styles.summaryLabel}>分数 {Number(cell.score).toFixed(1)}</div> : null}
                          {cell.submittedAt ? <div className={styles.summaryLabel}>{fmt(cell.submittedAt)}</div> : null}
                        </td>
                      ))}
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={3 + data.homeworks.length}>
                        <div className={styles.emptyState}>暂无学生</div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className={styles.panel} style={{ marginTop: 16 }}>
            <div className={styles.sectionHeader}>
              <div>
                <h3 className={styles.sectionTitle}>课程作业日志记录</h3>
                <p className={styles.sectionSubtitle}>包含提交、批改/成绩发布、重做申请等关键记录。</p>
              </div>
              <span className={styles.sectionTag}>{data.logs.length} 条</span>
            </div>
            <div className={styles.adminLogTableWrap}>
              <table className={styles.adminLogTable}>
                <thead>
                  <tr>
                    <th>时间</th>
                    <th>类型</th>
                    <th>学生</th>
                    <th>作业</th>
                    <th>详情</th>
                  </tr>
                </thead>
                <tbody>
                  {data.logs.length ? data.logs.map((log) => (
                    <tr key={log.id}>
                      <td>{fmt(log.time)}</td>
                      <td><span className={styles.logPill}>{log.type}</span></td>
                      <td>
                        {log.studentName}
                        <div className={styles.summaryLabel}>{log.studentEmail}</div>
                      </td>
                      <td>{log.homeworkTitle}</td>
                      <td className={styles.logDetailCell}>{log.detail}</td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={5}><div className={styles.emptyState}>暂无日志</div></td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </AdminLayout>
  );
}
