import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import AdminLayout from "./AdminLayout";
import styles from "./admin.module.css";

type ClassRow = {
  id: string;
  name: string;
};

type CourseRow = {
  id: string;
  title: string;
  courseCode: string | null;
  published: boolean;
  teacher?: { id: string; name: string };
  _count?: { enrollments?: number; labs?: number; homeworks?: number };
  classes?: ClassRow[];
};

export default function AdminClass() {
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/courses/mine");
        if (!cancelled) setCourses(data.courses ?? []);
      } catch {
        if (!cancelled) setError("班级目录暂时无法加载");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AdminLayout title="班级目录" subtitle={`${courses.length} 个课程`}>
      {error ? <div className="page-alert page-alert--warn">{error}</div> : null}

      <section className={styles.card}>
        <div className={styles.quickTitle}>课程与班级一览</div>
        <div className={styles.quickDesc}>点击课程可进入课程管理；班级信息用于后续选课分班与教学运维。</div>
      </section>

      <section className={styles.card} style={{ marginTop: 16 }}>
        {loading ? (
          <div className="muted">加载中…</div>
        ) : courses.length === 0 ? (
          <div className="muted">暂无课程</div>
        ) : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>课程</th>
                  <th>教师</th>
                  <th>状态</th>
                  <th>班级</th>
                  <th>选课人数</th>
                  <th>作业 / 实验</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {courses.map((course) => (
                  <tr key={course.id}>
                    <td>
                      <div className="data-table__primary">{course.title}</div>
                      <div className="data-table__muted">{course.courseCode ?? "-"}</div>
                    </td>
                    <td>{course.teacher?.name ?? "-"}</td>
                    <td>{course.published ? "已发布" : "未发布"}</td>
                    <td>
                      <div style={{ display: "grid", gap: 4 }}>
                        {(course.classes ?? []).length ? (
                          course.classes?.map((cls) => <span key={cls.id} className="status-badge status-badge--muted">{cls.name}</span>)
                        ) : (
                          <span className="muted">暂无班级</span>
                        )}
                      </div>
                    </td>
                    <td>{course._count?.enrollments ?? 0}</td>
                    <td>
                      {course._count?.homeworks ?? 0} 作业 · {course._count?.labs ?? 0} 实验
                    </td>
                    <td>
                      <Link className="btn" to={`/courses/${course.id}/manage`}>
                        进入课程
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AdminLayout>
  );
}
